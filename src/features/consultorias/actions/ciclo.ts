'use server'

import { and, eq, gt, lt, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentos,
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaReservas,
  usuarios,
} from '@/db/schema'
import { TIPOS_EVENTO_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { alterarStatusDoAtendimento } from '@/features/atendimentos/lib/alterar-status'
import { concluirAtendimento } from '@/features/atendimentos/lib/concluir-atendimento'
import { STATUS_INICIAL_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import {
  LIMITE_MOTIVO_CANCELAMENTO,
  MENSAGEM_AINDA_NAO_TERMINOU,
  MENSAGEM_CANCELADA_NAO_CONCLUI,
  MENSAGEM_JA_CONCLUIDA,
  MENSAGEM_MOTIVO_OBRIGATORIO,
  MENSAGEM_SEM_ACESSO_AO_CICLO,
  MENSAGEM_SO_O_PROFISSIONAL_CONCLUI,
  type PapelDoCiclo,
} from '../constants/ciclo'
import { MENSAGEM_HORARIO_INDISPONIVEL } from '../constants/contratacao'
import { avaliarAlteracao, normalizarMotivo } from '../lib/ciclo'
import { bordasDeConflito } from '../lib/reserva'
import {
  dataLocalDoInstante,
  horaDeMinutos,
  minutosLocaisDoInstante,
} from '../lib/tempo'
import { listarHorariosDoDia, obterAgendaDoMes } from '../queries/agenda-publica'
import type { ResultadoDoCiclo } from '../types/ciclo'
import type { AgendaDoDiaDTO, AgendaDoMesDTO } from '../types/consultoria'

const CancelarSchema = z.object({
  /** O único identificador que vem do navegador. Papel e posse saem do banco. */
  agendamentoId: z.string().uuid('Consultoria inválida.'),
  motivo: z.string().max(LIMITE_MOTIVO_CANCELAMENTO).optional().nullable(),
})

const RemarcarSchema = z.object({
  agendamentoId: z.string().uuid('Consultoria inválida.'),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.'),
})

const SEM_ACESSO = {
  situacao: 'sem_acesso',
  mensagem: MENSAGEM_SEM_ACESSO_AO_CICLO,
} as const

const INDISPONIVEL = {
  situacao: 'horario_indisponivel',
  mensagem: MENSAGEM_HORARIO_INDISPONIVEL,
} as const

type ConsultoriaDoCiclo = {
  id: string
  configuracaoId: string
  prestadorId: string
  clienteUsuarioId: string
  inicioEm: Date
  fimEm: Date
  timezone: string
  duracaoMinutos: number
  status: string
  remarcacoes: number
  atendimentoId: string | null
  protocolo: string | null
  clienteNome: string
  prestadorNome: string
}

const clienteConta = alias(usuarios, 'cliente_conta')
const prestadorConta = alias(usuarios, 'prestador_conta')

/**
 * Carrega a consultoria **e** decide o papel de quem pediu, numa consulta só.
 *
 * ## Por que o papel não vem do navegador
 *
 * Porque papel é permissão. Um campo `papel: 'prestador'` enviado pelo cliente
 * seria uma promoção por conta própria — e é justamente o Profissional que tem
 * o prazo mais largo. Aqui o papel é **derivado**: a sessão é comparada com as
 * duas colunas do contrato, e quem não é nenhuma das duas não recebe papel
 * nenhum, logo não recebe consultoria nenhuma.
 *
 * Gestor não aparece nesta conta de propósito. Ser Gestor dá acesso
 * administrativo à plataforma; não dá o direito de desmarcar o compromisso de
 * duas outras pessoas.
 */
async function carregarParaOCiclo(
  agendamentoId: string,
  usuarioId: string,
): Promise<{ consultoria: ConsultoriaDoCiclo; papel: PapelDoCiclo } | null> {
  const [linha] = await db
    .select({
      id: consultoriaAgendamentos.id,
      configuracaoId: consultoriaAgendamentos.configuracaoId,
      prestadorId: consultoriaAgendamentos.prestadorId,
      clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
      timezone: consultoriaAgendamentos.timezone,
      duracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
      status: consultoriaAgendamentos.status,
      remarcacoes: consultoriaAgendamentos.remarcacoes,
      atendimentoId: atendimentos.id,
      protocolo: atendimentos.protocolo,
      clienteNome: clienteConta.nome,
      prestadorNome: prestadorConta.nome,
    })
    .from(consultoriaAgendamentos)
    .innerJoin(
      clienteConta,
      eq(clienteConta.id, consultoriaAgendamentos.clienteUsuarioId),
    )
    .innerJoin(
      prestadorConta,
      eq(prestadorConta.id, consultoriaAgendamentos.prestadorId),
    )
    // `left` de propósito: sem Atendimento vinculado a consultoria ainda existe
    // e ainda pode ser desmarcada — ela só não tem onde registrar o histórico.
    .leftJoin(
      atendimentos,
      eq(atendimentos.consultoriaAgendamentoId, consultoriaAgendamentos.id),
    )
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)

  if (!linha) return null

  const papel: PapelDoCiclo | null =
    linha.clienteUsuarioId === usuarioId
      ? 'cliente'
      : linha.prestadorId === usuarioId
        ? 'prestador'
        : null

  // Nem parte do contrato, nem consultoria: a recusa é a mesma nos dois casos,
  // para não ensinar a quem tentou qual dos dois chutes chegou mais perto.
  if (!papel) return null

  return { consultoria: linha, papel }
}

/** `28/08/2026 às 14:30`, sempre no fuso contratado. */
function quandoLegivel(instante: Date, timezone: string) {
  const data = dataLocalDoInstante(instante, timezone)
  const [ano, mes, dia] = data.split('-')
  const hora = horaDeMinutos(minutosLocaisDoInstante(instante, timezone))
  return `${dia}/${mes}/${ano} às ${hora}`
}

/**
 * Cancela a consultoria — e não apaga nada.
 *
 * ## O que "cancelar" é, no banco
 *
 * Uma troca de `status` mais três carimbos: quando, quem e por quê. O horário
 * volta à venda **como consequência**, e não como um segundo passo que alguém
 * precisa lembrar de executar: a consulta que monta a agenda pública já só
 * conta consultorias `agendada`, então o slot é liberado no mesmo instante e
 * pelo mesmo `UPDATE`. Não há janela em que a consultoria esteja cancelada e o
 * horário continue bloqueado.
 *
 * ## Por que o Atendimento continua
 *
 * Porque ele é o registro do que aconteceu, não do que está marcado. O Cliente
 * pagou, escreveu o assunto, abriu protocolo — apagar isso ao desmarcar
 * destruiria a única prova de que a relação existiu, justamente no momento em
 * que ela pode virar reclamação. O protocolo fica, o pagamento simulado fica, a
 * manifestação fica, e o histórico ganha mais uma linha.
 *
 * ## Idempotência
 *
 * O `UPDATE` exige `status = 'agendada'`. Clique duplo, retry e F5: o segundo
 * não afeta linha nenhuma, não emite evento e não toca o sino de novo — e
 * responde `ja_cancelada`, que é a verdade.
 */
export async function cancelarConsultoria(
  entrada: z.input<typeof CancelarSchema>,
): Promise<ResultadoDoCiclo> {
  const validado = CancelarSchema.safeParse(entrada)
  if (!validado.success) {
    return {
      situacao: 'dados_invalidos',
      mensagem: validado.error.issues[0]?.message ?? 'Revise os dados.',
    }
  }

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return {
      situacao: 'precisa_entrar',
      mensagem: 'Entre na sua conta para continuar.',
    }
  }

  const carregado = await carregarParaOCiclo(validado.data.agendamentoId, sessao.id)
  if (!carregado) return SEM_ACESSO
  const { consultoria, papel } = carregado

  const agora = new Date()
  const veredicto = avaliarAlteracao(consultoria, papel, agora)
  if (!veredicto.pode) {
    return {
      situacao: veredicto.motivo === 'ja_cancelada' ? 'ja_cancelada' : 'fora_do_prazo',
      mensagem: veredicto.mensagem,
    }
  }

  const motivo = normalizarMotivo(validado.data.motivo)
  /**
   * Motivo obrigatório só para o Profissional.
   *
   * Não é burocracia: é a assimetria de quem desmarca o compromisso do outro.
   * O Cliente que desmarca desiste do próprio atendimento; o Profissional que
   * desmarca desfaz o compromisso de alguém que reservou a tarde e pagou. Nesse
   * caso o Cliente tem direito a uma explicação, e é ela que aparece no
   * Atendimento dele.
   */
  if (papel === 'prestador' && !motivo) {
    return { situacao: 'dados_invalidos', mensagem: MENSAGEM_MOTIVO_OBRIGATORIO }
  }

  const quando = quandoLegivel(consultoria.inicioEm, consultoria.timezone)
  const autorNome =
    papel === 'cliente' ? consultoria.clienteNome : consultoria.prestadorNome
  const rotuloPapel = papel === 'cliente' ? 'Cliente' : 'Profissional'

  const cancelou = await db.transaction(async (tx) => {
    const alteradas = await tx
      .update(consultoriaAgendamentos)
      .set({
        status: 'cancelada',
        canceladoEm: agora,
        canceladoPor: sessao.id,
        motivoCancelamento: motivo,
        updatedAt: agora,
      })
      // A trava de idempotência: só uma execução encontra `agendada`.
      .where(
        and(
          eq(consultoriaAgendamentos.id, consultoria.id),
          eq(consultoriaAgendamentos.status, 'agendada'),
        ),
      )
      .returning({ id: consultoriaAgendamentos.id })

    if (!alteradas.length) return false

    if (consultoria.atendimentoId) {
      await tx.insert(atendimentoEventos).values({
        atendimentoId: consultoria.atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.consultoriaCancelada,
        descricao: motivo
          ? `Consultoria de ${quando} cancelada pelo ${rotuloPapel}. Motivo: ${motivo}`
          : `Consultoria de ${quando} cancelada pelo ${rotuloPapel}.`,
        autorId: sessao.id,
        // O Cliente precisa ler o motivo do Profissional: evento público.
        visivelCliente: true,
        metadados: {
          consultoriaAgendamentoId: consultoria.id,
          canceladoPor: papel,
          inicioEm: consultoria.inicioEm.toISOString(),
          motivo,
        },
        createdAt: agora,
      })
    }

    await emitirNotificacoes(tx, {
      // Só a outra parte. `emitirNotificacoes` já descarta o autor, e mandar os
      // dois aqui só deixaria a regra dependendo dela em vez de declará-la.
      destinatarios: [
        papel === 'cliente' ? consultoria.prestadorId : consultoria.clienteUsuarioId,
      ],
      autorId: sessao.id,
      tipo: TIPOS_NOTIFICACAO.consultoriaCancelada,
      titulo: 'Consultoria cancelada',
      resumo: resumirTexto(
        `${autorNome} cancelou a consultoria de ${quando}.${motivo ? ` Motivo: ${motivo}` : ''}`,
        200,
      ),
      recursoTipo: 'atendimento',
      recursoId: consultoria.atendimentoId ?? consultoria.id,
      atendimentoId: consultoria.atendimentoId,
      protocolo: consultoria.protocolo,
      destino: { pagina: 'atendimentos', atendimento: consultoria.protocolo ?? '' },
      // Um cancelamento por consultoria: retry e duplo clique não tocam o sino
      // duas vezes nem que passem pela trava acima.
      chaveDedupe: `${TIPOS_NOTIFICACAO.consultoriaCancelada}:${consultoria.id}`,
    })

    return true
  })

  if (!cancelou) {
    return { situacao: 'ja_cancelada', mensagem: 'Esta consultoria já foi cancelada.' }
  }

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.consultoriaCancelada,
    entidade: 'consultoria_agendamentos',
    registroAfetado: consultoria.id,
    autorId: sessao.id,
    usuarioId:
      papel === 'cliente' ? consultoria.prestadorId : consultoria.clienteUsuarioId,
    origem: 'sistema',
    metadados: { papel, protocolo: consultoria.protocolo, motivo },
  })

  revalidatePath('/cliente')
  revalidatePath('/admin')
  revalidatePath('/perfil-profissional')

  return { situacao: 'cancelada', protocolo: consultoria.protocolo, quando }
}

/**
 * Remarca a consultoria para outro horário — a mesma consultoria, outro quando.
 *
 * ## Por que não há "cancelar e contratar de novo"
 *
 * Porque seria outro contrato: outro agendamento, outro Atendimento, outro
 * protocolo, outro pagamento. O Cliente perderia o histórico, o assunto que
 * escreveu e o número que já anotou — e o Profissional veria duas entradas para
 * uma consulta só. Remarcar é uma alteração do compromisso existente, e é
 * exatamente isso que a linha do banco registra: as datas mudam, o `id` não.
 *
 * ## A troca é atômica, e essa é a parte que importa
 *
 * Tudo acontece dentro de uma transação que começa travando a configuração
 * (`SELECT ... FOR UPDATE`) — a mesma fila que a reserva da Etapa 5 usa. Dentro
 * dela: confere se o horário novo está livre e, só então, muda as datas.
 *
 * Como as duas datas vivem na **mesma linha**, adquirir o novo e liberar o
 * antigo são a mesma instrução. Não existe instante em que a consultoria esteja
 * sem horário, nem em que ocupe dois. E se o horário novo estiver ocupado, o
 * `UPDATE` simplesmente não acontece: a consultoria continua exatamente onde
 * estava, com o slot antigo intacto.
 *
 * ## A sala da videochamada
 *
 * O vínculo com a sala Daily é **desfeito** (`daily_room_name = NULL`). A sala
 * antiga foi criada com `nbf`/`exp` do horário anterior: reaproveitá-la deixaria
 * a consultoria com uma porta que abre na hora errada — e que fecha antes de a
 * nova consulta começar. Anulando o vínculo, a próxima entrada cria
 * preguiçosamente uma sala nova, já com a janela certa. A antiga expira sozinha
 * na Daily, sem limpeza destrutiva.
 */
export async function remarcarConsultoria(
  entrada: z.input<typeof RemarcarSchema>,
): Promise<ResultadoDoCiclo> {
  const validado = RemarcarSchema.safeParse(entrada)
  if (!validado.success) {
    return {
      situacao: 'dados_invalidos',
      mensagem: validado.error.issues[0]?.message ?? 'Revise os dados.',
    }
  }

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return {
      situacao: 'precisa_entrar',
      mensagem: 'Entre na sua conta para continuar.',
    }
  }

  const carregado = await carregarParaOCiclo(validado.data.agendamentoId, sessao.id)
  if (!carregado) return SEM_ACESSO
  const { consultoria, papel } = carregado

  const agora = new Date()
  const veredicto = avaliarAlteracao(consultoria, papel, agora)
  if (!veredicto.pode) {
    return {
      situacao: veredicto.motivo === 'ja_cancelada' ? 'ja_cancelada' : 'fora_do_prazo',
      mensagem: veredicto.mensagem,
    }
  }

  /**
   * O horário novo precisa ser um slot que a agenda realmente oferece.
   *
   * A mesma consulta que desenha o calendário público valida a escolha — faixas
   * do Profissional, exceções, antecedência mínima, horizonte e folga entre
   * consultas. Aceitar um `inicio` qualquer porque "veio da nossa tela"
   * permitiria marcar 03:00 de domingo com uma requisição escrita à mão.
   *
   * `ignorarAgendamentoId` faz a própria consultoria não bloquear a si mesma.
   */
  const agenda = await listarHorariosDoDia({
    prestadorId: consultoria.prestadorId,
    data: validado.data.data,
    agora,
    ignorarAgendamentoId: consultoria.id,
  })

  const slot = agenda.horarios.find((h) => h.inicio === validado.data.inicio)
  if (!agenda.consultoria || !slot) return INDISPONIVEL

  const novoInicio = slot.inicioEm
  const novoFim = slot.fimEm

  /**
   * Remarcar para o mesmo horário não é remarcar.
   *
   * O horário atual continua aparecendo entre os disponíveis — e deve, porque a
   * consultoria não bloqueia a si mesma e a pessoa precisa reconhecer onde
   * está. Mas confirmá-lo produziria uma alteração que não altera nada: mais um
   * evento no histórico, mais um aviso no sino do outro lado e o contador de
   * remarcações subindo por um compromisso que não se moveu.
   */
  if (novoInicio.getTime() === consultoria.inicioEm.getTime()) {
    return {
      situacao: 'dados_invalidos',
      mensagem: 'Escolha um horário diferente do atual.',
    }
  }

  const antes = quandoLegivel(consultoria.inicioEm, consultoria.timezone)
  const depois = quandoLegivel(novoInicio, consultoria.timezone)

  const resultado = await db.transaction(async (tx) => {
    // A fila do banco. Enquanto esta transação viver, nenhuma outra aquisição
    // desta agenda passa daqui — é a mesma trava da reserva.
    const [configuracao] = await tx
      .select({
        id: consultoriaConfiguracoes.id,
        intervaloMinutos: consultoriaConfiguracoes.intervaloMinutos,
      })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.id, consultoria.configuracaoId))
      .for('update')
      .limit(1)

    if (!configuracao) return INDISPONIVEL

    const { limiteInferior, limiteSuperior } = bordasDeConflito(
      { inicioEm: novoInicio, fimEm: novoFim },
      configuracao.intervaloMinutos,
    )

    // Alguém segurando o horário novo com uma reserva viva?
    const reservado = await tx
      .select({ id: consultoriaReservas.id })
      .from(consultoriaReservas)
      .where(
        and(
          eq(consultoriaReservas.configuracaoId, configuracao.id),
          eq(consultoriaReservas.status, 'ativa'),
          gt(consultoriaReservas.expiraEm, agora),
          lt(consultoriaReservas.inicioEm, limiteSuperior),
          gt(consultoriaReservas.fimEm, limiteInferior),
        ),
      )
      .limit(1)

    if (reservado.length) return INDISPONIVEL

    // Ou outra consultoria já contratada — exceto esta, que está se movendo.
    const contratado = await tx
      .select({ id: consultoriaAgendamentos.id })
      .from(consultoriaAgendamentos)
      .where(
        and(
          eq(consultoriaAgendamentos.configuracaoId, configuracao.id),
          eq(consultoriaAgendamentos.status, 'agendada'),
          ne(consultoriaAgendamentos.id, consultoria.id),
          lt(consultoriaAgendamentos.inicioEm, limiteSuperior),
          gt(consultoriaAgendamentos.fimEm, limiteInferior),
        ),
      )
      .limit(1)

    if (contratado.length) return INDISPONIVEL

    /**
     * A troca, numa instrução.
     *
     * `status = 'agendada'` no `where` é a idempotência: uma consultoria
     * cancelada entre a leitura e a escrita não é remarcada por engano. E como
     * as duas datas são colunas da mesma linha, o horário novo é ocupado e o
     * antigo liberado no mesmo instante — não há meio-caminho observável.
     */
    const alteradas = await tx
      .update(consultoriaAgendamentos)
      .set({
        inicioEm: novoInicio,
        fimEm: novoFim,
        remarcadoEm: agora,
        remarcacoes: consultoria.remarcacoes + 1,
        // A sala antiga tem a janela do horário antigo. Desfazer o vínculo faz
        // a próxima entrada criar uma sala com a janela nova.
        dailyRoomName: null,
        dailyRoomCriadaEm: null,
        updatedAt: agora,
      })
      .where(
        and(
          eq(consultoriaAgendamentos.id, consultoria.id),
          eq(consultoriaAgendamentos.status, 'agendada'),
          // O horário de origem precisa ser o que lemos: se outra requisição
          // remarcou primeiro, esta não sobrescreve o trabalho dela.
          eq(consultoriaAgendamentos.inicioEm, consultoria.inicioEm),
        ),
      )
      .returning({ id: consultoriaAgendamentos.id })

    if (!alteradas.length) return INDISPONIVEL

    const autorNome =
      papel === 'cliente' ? consultoria.clienteNome : consultoria.prestadorNome
    const rotuloPapel = papel === 'cliente' ? 'Cliente' : 'Profissional'

    if (consultoria.atendimentoId) {
      await tx.insert(atendimentoEventos).values({
        atendimentoId: consultoria.atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.consultoriaRemarcada,
        descricao: `Consultoria remarcada de ${antes} para ${depois} pelo ${rotuloPapel}.`,
        autorId: sessao.id,
        visivelCliente: true,
        metadados: {
          consultoriaAgendamentoId: consultoria.id,
          remarcadoPor: papel,
          de: consultoria.inicioEm.toISOString(),
          para: novoInicio.toISOString(),
        },
        createdAt: agora,
      })
    }

    await emitirNotificacoes(tx, {
      destinatarios: [
        papel === 'cliente' ? consultoria.prestadorId : consultoria.clienteUsuarioId,
      ],
      autorId: sessao.id,
      tipo: TIPOS_NOTIFICACAO.consultoriaRemarcada,
      titulo: 'Consultoria remarcada',
      resumo: resumirTexto(
        `${autorNome} remarcou a consultoria para ${depois}.`,
        200,
      ),
      recursoTipo: 'atendimento',
      recursoId: consultoria.atendimentoId ?? consultoria.id,
      atendimentoId: consultoria.atendimentoId,
      protocolo: consultoria.protocolo,
      destino: { pagina: 'atendimentos', atendimento: consultoria.protocolo ?? '' },
      /**
       * A chave inclui o horário novo.
       *
       * Duas remarcações são dois fatos e merecem dois avisos; duas tentativas
       * da **mesma** remarcação são um fato só. Amarrar a chave ao destino
       * separa exatamente esses dois casos.
       */
      chaveDedupe: `${TIPOS_NOTIFICACAO.consultoriaRemarcada}:${consultoria.id}:${novoInicio.toISOString()}`,
    })

    return { situacao: 'remarcada' as const, protocolo: consultoria.protocolo, antes, depois }
  })

  if (resultado.situacao !== 'remarcada') return resultado

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.consultoriaRemarcada,
    entidade: 'consultoria_agendamentos',
    registroAfetado: consultoria.id,
    autorId: sessao.id,
    usuarioId:
      papel === 'cliente' ? consultoria.prestadorId : consultoria.clienteUsuarioId,
    origem: 'sistema',
    metadados: {
      papel,
      de: consultoria.inicioEm.toISOString(),
      para: novoInicio.toISOString(),
    },
  })

  revalidatePath('/cliente')
  revalidatePath('/admin')
  revalidatePath('/perfil-profissional')

  return resultado
}

const AgendaParaRemarcarSchema = z.object({
  agendamentoId: z.string().uuid(),
  ano: z.coerce.number().int().min(1970).max(9999),
  mes: z.coerce.number().int().min(1).max(12),
})

const HorariosParaRemarcarSchema = z.object({
  agendamentoId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/**
 * A agenda que o modal de remarcação desenha.
 *
 * ## Por que não a agenda pública de sempre
 *
 * Por duas diferenças que mudam o resultado. A primeira: a consultoria que está
 * sendo movida **não** pode bloquear a si mesma — sem `ignorarAgendamentoId`, o
 * próprio compromisso apareceria como ocupação e apagaria os horários vizinhos
 * pela folga entre consultas. A segunda: quem remarca pode ser o Profissional,
 * e ele não é "um cliente olhando o perfil" — não há `prestadorId` na URL para
 * ele, o Profissional é derivado do agendamento.
 *
 * ## Por que exige autorização, se a agenda é pública
 *
 * Porque a entrada é um `agendamentoId`, e responder a qualquer um confirmaria
 * que aquele id existe. A agenda em si continua pública pelo perfil; o que não
 * é público é a associação entre um identificador de consultoria e um
 * Profissional.
 */
export async function buscarAgendaParaRemarcacao(
  entrada: z.input<typeof AgendaParaRemarcarSchema>,
): Promise<AgendaDoMesDTO> {
  const vazio: AgendaDoMesDTO = {
    consultoria: null,
    mes: { ano: 1970, mes: 1 },
    dias: [],
    hoje: null,
    ultimoDia: null,
  }
  const validado = AgendaParaRemarcarSchema.safeParse(entrada)
  if (!validado.success) return vazio

  const sessao = await obterSessaoServidor()
  if (!sessao) return vazio
  const carregado = await carregarParaOCiclo(validado.data.agendamentoId, sessao.id)
  if (!carregado) return vazio

  return obterAgendaDoMes({
    prestadorId: carregado.consultoria.prestadorId,
    mes: { ano: validado.data.ano, mes: validado.data.mes },
    ignorarAgendamentoId: carregado.consultoria.id,
  })
}

/** Os horários de um dia, com a mesma autorização e o mesmo "ignorar a si". */
export async function buscarHorariosParaRemarcacao(
  entrada: z.input<typeof HorariosParaRemarcarSchema>,
): Promise<AgendaDoDiaDTO> {
  const vazio: AgendaDoDiaDTO = { consultoria: null, data: '', horarios: [] }
  const validado = HorariosParaRemarcarSchema.safeParse(entrada)
  if (!validado.success) return vazio

  const sessao = await obterSessaoServidor()
  if (!sessao) return vazio
  const carregado = await carregarParaOCiclo(validado.data.agendamentoId, sessao.id)
  if (!carregado) return vazio

  return listarHorariosDoDia({
    prestadorId: carregado.consultoria.prestadorId,
    data: validado.data.data,
    ignorarAgendamentoId: carregado.consultoria.id,
  })
}

const ConcluirSchema = z.object({
  agendamentoId: z.string().uuid('Consultoria inválida.'),
})

/**
 * Conclui a consultoria — porque alguém afirma que ela aconteceu.
 *
 * ## Por que o relógio não conclui sozinho
 *
 * Porque o horário ter passado não é prova de que a consulta ocorreu. O
 * Cliente pode não ter aparecido, a conexão pode ter caído, o encontro pode ter
 * durado dois minutos e sido remarcado por fora. Concluir automaticamente às
 * 15:30 registraria como prestado um atendimento que talvez não tenha
 * existido — e é sobre esse registro que a avaliação pública se apoia depois.
 *
 * Presença na sala Daily também não conclui: entrar não é atender. A afirmação
 * é de uma pessoa, e a pessoa é o Profissional responsável.
 *
 * ## Por que também conclui o Atendimento
 *
 * Porque a plataforma já tem um conceito de trabalho concluído, com transição
 * de status, histórico, e — o que importa aqui — é ele que libera a avaliação
 * do Cliente. Concluir a consultoria sem concluir o Atendimento deixaria o
 * protocolo eternamente aberto e a avaliação inalcançável, e criar um segundo
 * caminho de avaliação só para consultorias duplicaria a reputação da
 * plataforma em duas médias que um dia discordariam.
 *
 * `concluirAtendimento` é reusado inteiro: mesma autorização, mesma transição,
 * mesma checagem de pendências, mesma idempotência.
 *
 * ## O que a conclusão **não** faz
 *
 * Não mexe na janela da videochamada. Ela continua sendo `[início−10min,
 * fim+15min)` e continua sendo a única regra de acesso — concluir não reabre
 * nada, e não concluir não mantém nada aberto. Também não apaga Atendimento,
 * protocolo, pagamento, histórico nem a sala.
 */
export async function concluirConsultoria(
  entrada: z.input<typeof ConcluirSchema>,
): Promise<ResultadoDoCiclo> {
  const validado = ConcluirSchema.safeParse(entrada)
  if (!validado.success) {
    return {
      situacao: 'dados_invalidos',
      mensagem: validado.error.issues[0]?.message ?? 'Revise os dados.',
    }
  }

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return { situacao: 'precisa_entrar', mensagem: 'Entre na sua conta para continuar.' }
  }

  const carregado = await carregarParaOCiclo(validado.data.agendamentoId, sessao.id)
  if (!carregado) return SEM_ACESSO
  const { consultoria, papel } = carregado

  // O Cliente é parte do contrato, mas não é quem presta o serviço: quem
  // declara que o atendimento aconteceu é quem o realizou.
  if (papel !== 'prestador') {
    return { situacao: 'sem_acesso', mensagem: MENSAGEM_SO_O_PROFISSIONAL_CONCLUI }
  }
  if (consultoria.status === 'cancelada') {
    return { situacao: 'ja_cancelada', mensagem: MENSAGEM_CANCELADA_NAO_CONCLUI }
  }
  if (consultoria.status === 'concluida') {
    return { situacao: 'ja_concluida', mensagem: MENSAGEM_JA_CONCLUIDA }
  }

  const agora = new Date()
  // Fronteira fechada: no instante exato do término já pode concluir.
  if (agora.getTime() < consultoria.fimEm.getTime()) {
    return { situacao: 'fora_do_prazo', mensagem: MENSAGEM_AINDA_NAO_TERMINOU }
  }

  const quando = quandoLegivel(agora, consultoria.timezone)

  const concluiu = await db.transaction(async (tx) => {
    const alteradas = await tx
      .update(consultoriaAgendamentos)
      .set({ status: 'concluida', concluidoEm: agora, concluidoPor: sessao.id, updatedAt: agora })
      // A trava de idempotência: só uma execução encontra `agendada`.
      .where(
        and(
          eq(consultoriaAgendamentos.id, consultoria.id),
          eq(consultoriaAgendamentos.status, 'agendada'),
        ),
      )
      .returning({ id: consultoriaAgendamentos.id })

    if (!alteradas.length) return false

    if (consultoria.atendimentoId) {
      await tx.insert(atendimentoEventos).values({
        atendimentoId: consultoria.atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.consultoriaConcluida,
        descricao: `Consultoria concluída pelo Profissional em ${quando}.`,
        autorId: sessao.id,
        visivelCliente: true,
        metadados: {
          consultoriaAgendamentoId: consultoria.id,
          inicioEm: consultoria.inicioEm.toISOString(),
          fimEm: consultoria.fimEm.toISOString(),
        },
        createdAt: agora,
      })
    }

    await emitirNotificacoes(tx, {
      destinatarios: [consultoria.clienteUsuarioId],
      autorId: sessao.id,
      tipo: TIPOS_NOTIFICACAO.consultoriaConcluida,
      titulo: 'Consultoria concluída',
      resumo: resumirTexto(
        `Sua consultoria com ${consultoria.prestadorNome} foi concluída. Conte como foi seu atendimento.`,
        200,
      ),
      recursoTipo: 'atendimento',
      recursoId: consultoria.atendimentoId ?? consultoria.id,
      atendimentoId: consultoria.atendimentoId,
      protocolo: consultoria.protocolo,
      destino: { pagina: 'atendimentos', atendimento: consultoria.protocolo ?? '' },
      chaveDedupe: `${TIPOS_NOTIFICACAO.consultoriaConcluida}:${consultoria.id}`,
    })

    return true
  })

  if (!concluiu) {
    return { situacao: 'ja_concluida', mensagem: MENSAGEM_JA_CONCLUIDA }
  }

  /**
   * O Atendimento fecha em seguida, fora da transação da consultoria.
   *
   * `concluirAtendimento` abre a própria transação e tem a própria
   * idempotência (`ja-concluido`), então chamá-lo aqui dentro aninharia
   * transações sem ganho. Se ele recusar — checklist pendente, por exemplo —, a
   * consultoria continua concluída e o protocolo segue aberto: são dois fatos
   * distintos, e o segundo pode ser resolvido pela tela de Atendimentos sem
   * desfazer o primeiro.
   */
  const doAtendimento = consultoria.atendimentoId
    ? await fecharAtendimentoDaConsultoria(consultoria.atendimentoId, sessao.id)
    : { sucesso: true as const }

  if (!doAtendimento.sucesso) {
    console.error('[CONCLUIR_CONSULTORIA] atendimento não fechou', {
      agendamentoId: consultoria.id,
      motivo: doAtendimento.motivo,
    })
  }

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.consultoriaConcluida,
    entidade: 'consultoria_agendamentos',
    registroAfetado: consultoria.id,
    autorId: sessao.id,
    usuarioId: consultoria.clienteUsuarioId,
    origem: 'sistema',
    metadados: { protocolo: consultoria.protocolo },
  })

  revalidatePath('/cliente')
  revalidatePath('/admin')

  return { situacao: 'concluida', protocolo: consultoria.protocolo, quando }
}

/**
 * Fecha o Atendimento de uma consultoria realizada, respeitando a máquina de estados.
 *
 * ## Por que dois passos
 *
 * O Atendimento de uma consultoria nasce em `novo` e fica lá: ninguém arrasta
 * card de consultoria pelo Kanban — o trabalho dela acontece na hora marcada,
 * não ao longo de dias. Mas a máquina de estados do Atendimento não aceita
 * `novo → concluido` direto, e está certa: para o resto da plataforma, pular de
 * "recebido" para "entregue" esconderia que o trabalho nunca foi iniciado.
 *
 * Aqui os dois passos são verdade, e é por isso que damos os dois em vez de
 * afrouxar a regra para todo mundo: a consulta **começou** (o horário chegou e
 * o encontro aconteceu) e **terminou** (o Profissional está afirmando isso). O
 * histórico registra os dois fatos na ordem em que ocorreram.
 */
async function fecharAtendimentoDaConsultoria(atendimentoId: string, usuarioId: string) {
  const [atual] = await db
    .select({ status: atendimentos.status })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)

  if (atual?.status === STATUS_INICIAL_ATENDIMENTO) {
    const iniciou = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId,
      destino: 'em_andamento',
    })
    // Se nem iniciar foi possível, concluir também não será — devolve o motivo
    // real em vez de tentar o passo seguinte e relatar um erro enganoso.
    if (!iniciou.sucesso) return iniciou
  }

  return concluirAtendimento({
    atendimentoId,
    usuarioId,
    observacaoFinal: null,
    /**
     * Pendências confirmadas de propósito.
     *
     * O checklist é o roteiro interno do escritório. Uma consulta que já
     * aconteceu não deixa de ter acontecido porque alguém não marcou uma etapa
     * — e travar o fecho por isso deixaria o Cliente sem poder avaliar.
     */
    confirmarPendencias: true,
  })
}
