'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, gt, isNotNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import {
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaDisponibilidades,
  consultoriaExcecoes,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import {
  datasDoIntervalo,
  encontrarConflitosDeAgenda,
  type ConflitoDeAgenda,
} from '../lib/conflitos-de-agenda'
import { horaParaColuna } from '../lib/tempo'
import { DataLocalSchema, FaixasSemanaisSchema } from '../schemas/consultoria'

/**
 * A agenda vista de dentro: o que o Profissional pode mudar, e o que a mudança
 * não pode fazer.
 *
 * ## O dono é a sessão
 *
 * Nenhuma função daqui aceita `prestadorId`. Ele é descoberto por
 * `obterPrestadorSessao`, a mesma porta que o catálogo e a carteira usam — o
 * isolamento entre profissionais é consequência da estrutura, não de uma
 * checagem que alguém possa esquecer.
 *
 * ## Mudar a agenda nunca desmarca ninguém
 *
 * Tirar a segunda de manhã da disponibilidade significa "não quero **novas**
 * consultas aí". As já vendidas continuam existindo — e é por isso que toda
 * alteração passa por uma checagem de conflito que **informa** em vez de
 * apagar. Só quem desmarca uma consulta é o caminho de cancelamento, com aviso
 * ao Cliente, motivo e histórico.
 */

const BloqueioSchema = z
  .object({
    dataInicio: DataLocalSchema,
    dataFim: DataLocalSchema,
    motivo: z.string().trim().max(240).optional(),
    /** Quem já viu os conflitos e decidiu seguir mesmo assim. */
    confirmarConflitos: z.boolean().optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.dataFim < dados.dataInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'A data final não pode ser anterior à inicial.',
      })
    }
    // 366 dias é o teto do laço que gera as datas; recusar aqui dá uma
    // mensagem em português em vez de um bloqueio truncado em silêncio.
    if (datasDoIntervalo(dados.dataInicio, dados.dataFim).length > 366) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataFim'],
        message: 'Um bloqueio pode cobrir no máximo um ano.',
      })
    }
  })

const DisponibilidadeSchema = z.object({
  faixas: FaixasSemanaisSchema,
  confirmarConflitos: z.boolean().optional(),
})

export type ResultadoDaAgenda =
  | { sucesso: true; mensagem: string }
  | { sucesso: false; mensagem: string }
  | {
      sucesso: false
      motivo: 'conflito'
      mensagem: string
      /** As consultas que ficariam fora do novo horário. Nenhuma foi tocada. */
      conflitos: ConflitoDeAgenda[]
    }

/** A configuração do prestador da sessão, travada para escrita. */
async function configuracaoTravada(tx: ExecutorDb, prestadorId: string) {
  const [configuracao] = await tx
    .select({
      id: consultoriaConfiguracoes.id,
      timezone: consultoriaConfiguracoes.timezone,
    })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, prestadorId))
    .for('update')
    .limit(1)
  return configuracao ?? null
}

/**
 * As consultas futuras que ainda estão de pé.
 *
 * Só `agendada` e só as que ainda vão acontecer: uma consulta de ontem não
 * entra em conflito com a agenda de amanhã, e uma cancelada não é compromisso
 * nenhum. É este recorte que evita transformar o histórico inteiro num muro.
 */
async function consultasFuturas(tx: ExecutorDb, configuracaoId: string, agora: Date) {
  return tx
    .select({
      id: consultoriaAgendamentos.id,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
      clienteNome: usuarios.nome,
    })
    .from(consultoriaAgendamentos)
    .innerJoin(usuarios, eq(usuarios.id, consultoriaAgendamentos.clienteUsuarioId))
    .where(
      and(
        eq(consultoriaAgendamentos.configuracaoId, configuracaoId),
        eq(consultoriaAgendamentos.status, 'agendada'),
        gt(consultoriaAgendamentos.inicioEm, agora),
      ),
    )
}

/**
 * Salva a disponibilidade semanal, avisando antes do que ficaria de fora.
 *
 * A gravação é um "substitui tudo" dentro da transação que já trava a
 * configuração — é o que impede dois envios simultâneos do mesmo formulário de
 * se intercalarem e produzirem uma semana meio antiga, meio nova.
 *
 * A checagem de conflito acontece **antes** da escrita e usa as faixas
 * propostas, não as gravadas: perguntar depois já teria destruído a informação
 * necessária para perguntar.
 */
export async function salvarDisponibilidadeDaAgenda(
  entrada: z.input<typeof DisponibilidadeSchema>,
): Promise<ResultadoDaAgenda> {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = DisponibilidadeSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Revise os horários.',
    }
  }
  const { faixas, confirmarConflitos } = validacao.data
  const agora = new Date()

  const resultado = await db.transaction(async (tx) => {
    const configuracao = await configuracaoTravada(tx, prestador.usuarioId)
    if (!configuracao) {
      return {
        sucesso: false as const,
        mensagem: 'Configure a consultoria antes de definir os horários.',
      }
    }

    if (!confirmarConflitos) {
      const conflitos = encontrarConflitosDeAgenda({
        consultas: await consultasFuturas(tx, configuracao.id, agora),
        faixas,
        timezone: configuracao.timezone,
      })
      if (conflitos.length) {
        return {
          sucesso: false as const,
          motivo: 'conflito' as const,
          mensagem:
            conflitos.length === 1
              ? 'Há 1 consultoria marcada fora do novo horário. Ela continua valendo.'
              : `Há ${conflitos.length} consultorias marcadas fora do novo horário. Elas continuam valendo.`,
          conflitos,
        }
      }
    }

    await tx
      .delete(consultoriaDisponibilidades)
      .where(eq(consultoriaDisponibilidades.configuracaoId, configuracao.id))

    if (faixas.length) {
      await tx.insert(consultoriaDisponibilidades).values(
        faixas.map((faixa) => ({
          configuracaoId: configuracao.id,
          diaSemana: faixa.diaSemana,
          horaInicio: horaParaColuna(faixa.horaInicio),
          horaFim: horaParaColuna(faixa.horaFim),
        })),
      )
    }

    return { sucesso: true as const, mensagem: 'Disponibilidade atualizada.', configuracao }
  })

  if (!resultado.sucesso) return resultado

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.agendaConsultoriaAlterada,
    entidade: 'consultoria_disponibilidades',
    registroAfetado: resultado.configuracao.id,
    autorId: prestador.usuarioId,
    usuarioId: prestador.usuarioId,
    origem: 'admin',
    metadados: {
      alteracao: 'disponibilidade_semanal',
      totalFaixas: faixas.length,
      // O que mudou, legível: "seg 09:00-12:00; qua 14:00-18:00".
      faixas: faixas.map((f) => `${f.diaSemana}:${f.horaInicio}-${f.horaFim}`),
      conflitosConfirmados: confirmarConflitos ?? false,
    },
  })

  revalidarAgenda()
  return { sucesso: true, mensagem: resultado.mensagem }
}

/**
 * Cria um bloqueio de vários dias — férias, viagem, licença.
 *
 * Uma linha de exceção por data, todas amarradas por `grupo_id`. É o formato
 * que o gerador de horários já entende (ele raciocina por dia), com o laço que
 * faltava para desfazer o bloqueio inteiro depois.
 *
 * `onConflictDoNothing`: se algum daqueles dias já estava marcado como
 * indisponível, o dia continua indisponível e nada quebra — bloquear o que já
 * estava bloqueado é um no-op, não um erro.
 */
export async function criarBloqueioDeAgenda(
  entrada: z.input<typeof BloqueioSchema>,
): Promise<ResultadoDaAgenda> {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = BloqueioSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false,
      mensagem: validacao.error.issues[0]?.message ?? 'Revise as datas.',
    }
  }
  const { dataInicio, dataFim, motivo, confirmarConflitos } = validacao.data
  const datas = datasDoIntervalo(dataInicio, dataFim)
  const agora = new Date()
  const grupoId = randomUUID()

  const resultado = await db.transaction(async (tx) => {
    const configuracao = await configuracaoTravada(tx, prestador.usuarioId)
    if (!configuracao) {
      return { sucesso: false as const, mensagem: 'Configure a consultoria primeiro.' }
    }

    if (!confirmarConflitos) {
      const conflitos = encontrarConflitosDeAgenda({
        consultas: await consultasFuturas(tx, configuracao.id, agora),
        // Só os dias bloqueados importam aqui: as faixas não mudaram, então
        // passar a semana inteira como "coberta" isola o efeito do bloqueio.
        faixas: [],
        diasBloqueados: datas.map((data) => ({ data })),
        timezone: configuracao.timezone,
      })
      const noPeriodo = conflitos.filter((c) => c.motivo === 'dia_bloqueado')
      if (noPeriodo.length) {
        return {
          sucesso: false as const,
          motivo: 'conflito' as const,
          mensagem:
            noPeriodo.length === 1
              ? 'Há 1 consultoria marcada dentro do período. Ela continua valendo.'
              : `Há ${noPeriodo.length} consultorias marcadas dentro do período. Elas continuam valendo.`,
          conflitos: noPeriodo,
        }
      }
    }

    await tx
      .insert(consultoriaExcecoes)
      .values(
        datas.map((data) => ({
          configuracaoId: configuracao.id,
          data,
          tipo: 'indisponivel_dia' as const,
          motivo: motivo ?? null,
          grupoId,
        })),
      )
      .onConflictDoNothing()

    return { sucesso: true as const, configuracao }
  })

  if (!resultado.sucesso) return resultado

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.agendaConsultoriaAlterada,
    entidade: 'consultoria_excecoes',
    registroAfetado: resultado.configuracao.id,
    autorId: prestador.usuarioId,
    usuarioId: prestador.usuarioId,
    origem: 'admin',
    metadados: {
      alteracao: 'bloqueio_criado',
      grupoId,
      dataInicio,
      dataFim,
      dias: datas.length,
      motivo: motivo ?? null,
    },
  })

  revalidarAgenda()
  return {
    sucesso: true,
    mensagem:
      datas.length === 1
        ? 'Bloqueio criado para 1 dia.'
        : `Bloqueio criado para ${datas.length} dias.`,
  }
}

/** Desfaz um bloqueio inteiro — todas as datas que nasceram juntas. */
export async function removerBloqueioDeAgenda(
  grupoId: string,
): Promise<ResultadoDaAgenda> {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO
  if (!z.string().uuid().safeParse(grupoId).success) {
    return { sucesso: false, mensagem: 'Bloqueio inválido.' }
  }

  const removidas = await db.transaction(async (tx) => {
    const configuracao = await configuracaoTravada(tx, prestador.usuarioId)
    if (!configuracao) return null

    /**
     * O `configuracao_id` no `where` é a autorização.
     *
     * Sem ele, um `grupo_id` adivinhado apagaria o bloqueio de outro
     * Profissional — e o id do grupo circula na tela de quem o criou. Com ele, o
     * comando simplesmente não encontra linha nenhuma.
     */
    return tx
      .delete(consultoriaExcecoes)
      .where(
        and(
          eq(consultoriaExcecoes.configuracaoId, configuracao.id),
          eq(consultoriaExcecoes.grupoId, grupoId),
        ),
      )
      .returning({ id: consultoriaExcecoes.id })
  })

  if (!removidas) return { sucesso: false, mensagem: 'Configure a consultoria primeiro.' }
  if (!removidas.length) return { sucesso: false, mensagem: 'Bloqueio não encontrado.' }

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.agendaConsultoriaAlterada,
    entidade: 'consultoria_excecoes',
    registroAfetado: grupoId,
    autorId: prestador.usuarioId,
    usuarioId: prestador.usuarioId,
    origem: 'admin',
    metadados: { alteracao: 'bloqueio_removido', grupoId, dias: removidas.length },
  })

  revalidarAgenda()
  return { sucesso: true, mensagem: 'Bloqueio removido.' }
}

/** Os bloqueios agrupados, do jeito que a tela lista: um item por período. */
export async function listarBloqueiosDaAgenda() {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return { sucesso: false as const, mensagem: SEM_AUTORIZACAO.mensagem, dados: [] }

  const [configuracao] = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, prestador.usuarioId))
    .limit(1)

  if (!configuracao) return { sucesso: true as const, dados: [] }

  const linhas = await db
    .select({
      grupoId: consultoriaExcecoes.grupoId,
      data: consultoriaExcecoes.data,
      motivo: consultoriaExcecoes.motivo,
    })
    .from(consultoriaExcecoes)
    .where(
      and(
        eq(consultoriaExcecoes.configuracaoId, configuracao.id),
        eq(consultoriaExcecoes.ativo, true),
        isNotNull(consultoriaExcecoes.grupoId),
      ),
    )

  // Uma linha por dia vira um item por período: a tela mostra "10 a 20 de
  // setembro", que é como a pessoa pensou quando criou.
  const porGrupo = new Map<
    string,
    { grupoId: string; dataInicio: string; dataFim: string; dias: number; motivo: string | null }
  >()
  for (const linha of linhas) {
    const chave = linha.grupoId!
    const atual = porGrupo.get(chave)
    if (!atual) {
      porGrupo.set(chave, {
        grupoId: chave,
        dataInicio: linha.data,
        dataFim: linha.data,
        dias: 1,
        motivo: linha.motivo,
      })
      continue
    }
    atual.dataInicio = linha.data < atual.dataInicio ? linha.data : atual.dataInicio
    atual.dataFim = linha.data > atual.dataFim ? linha.data : atual.dataFim
    atual.dias += 1
  }

  return {
    sucesso: true as const,
    dados: [...porGrupo.values()].sort((a, b) => a.dataInicio.localeCompare(b.dataInicio)),
  }
}

/**
 * Uma alteração de agenda muda o que o público enxerga.
 *
 * O perfil do Profissional e a listagem são renderizados no servidor, então
 * invalidar as rotas é o que faz o calendário refletir a mudança sem esperar o
 * cache expirar. `/admin` entra porque a própria tela de configuração relê os
 * dados depois de salvar.
 */
function revalidarAgenda() {
  revalidatePath('/admin')
  revalidatePath('/perfil-profissional')
  revalidatePath('/profissionais')
}
