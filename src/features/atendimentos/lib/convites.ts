import { and, desc, eq, lte, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoConviteMensagens,
  atendimentoConvites,
  atendimentoEventos,
  atendimentos,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import {
  DIAS_VALIDADE_CONVITE_ATENDIMENTO,
  TIPOS_EVENTO_ATENDIMENTO,
  type StatusConviteAtendimento,
  type TipoMensagemNegociacao,
} from '../constants/atendimento'
import { obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento } from './autorizacao'
import { difundirNoConvite } from './difusao'
import type { ExecutorDb } from './executor'
import {
  marcarNotificacoesDoRecursoComoLidas,
  registrarLeitura,
} from './leitura'
import { registrarParticipante } from './participantes'

export type MotivoConvite =
  | 'sem-acesso'
  | 'nao-encontrado'
  | 'destinatario-invalido'
  | 'ja-participa'
  | 'ja-convidado'
  | 'encerrado'
  | 'expirado'
  | 'vazio'

export type ResultadoConvite =
  | { sucesso: true; id: string }
  | { sucesso: false; motivo: MotivoConvite }

const UM_DIA = 24 * 60 * 60 * 1000

/** Quem pode convidar e revogar: o dono da carteira e o responsável atual. */
async function exigirGestor(atendimentoId: string, usuarioId: string) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return null
  if (acesso.vinculo !== 'prestador' && acesso.vinculo !== 'responsavel') {
    return null
  }
  return acesso
}

async function nomeDaPessoa(executor: ExecutorDb, usuarioId: string) {
  const [pessoa] = await executor
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  return pessoa?.nome ?? 'Prestador'
}

/**
 * Marca como expirados os convites pendentes cuja validade passou.
 *
 * Um pendente vencido continuaria ocupando o índice de unicidade e impediria um
 * convite novo para a mesma pessoa — o vencimento precisa ser um fato gravado,
 * não uma comparação feita na tela.
 *
 * Quem chama:
 *
 * - o **agendador**, de hora em hora, que é o dono da responsabilidade
 *   temporal desde que ele existe;
 * - `convidarParaAtendimento`, como pré-condição transacional do índice único;
 * - as guardas de `escreverNaNegociacao` e `responderConvite`, no instante em
 *   que descobrem que aquele convite específico venceu.
 *
 * As duas últimas não são agendamento disfarçado: elas gravam o vencimento de
 * um convite que a própria operação acabou de recusar, e continuam necessárias
 * mesmo com o agendador no ar — entre duas execuções dele, a recusa precisa
 * valer imediatamente.
 *
 * Idempotente por construção: o `where` só alcança pendentes já vencidos, então
 * a segunda execução não encontra nada.
 */
export async function expirarConvitesVencidos(executor: ExecutorDb = db) {
  const agora = new Date()
  const expirados = await executor
    .update(atendimentoConvites)
    .set({ status: 'expirado', updatedAt: agora })
    .where(
      and(
        eq(atendimentoConvites.status, 'pendente'),
        lte(atendimentoConvites.expiraEm, agora),
      ),
    )
    .returning({ id: atendimentoConvites.id })

  return expirados.length
}

/**
 * Convite de colaboração para um Atendimento específico.
 *
 * O convidado **não** vira participante aqui: neste momento ele só ganha o
 * direito de analisar um recorte do Atendimento e negociar. A entrada acontece
 * no aceite, e em nenhum outro lugar — é o que impede um convite recusado de
 * deixar acesso para trás.
 *
 * O escopo escrito vira a primeira linha da negociação, com o valor oferecido
 * anexado quando existir: assim a proposta inicial é uma linha da conversa como
 * qualquer outra, e não um campo solto que ninguém sabe quando mudou.
 */
export async function convidarParaAtendimento({
  atendimentoId,
  usuarioId,
  destinatarioId,
  escopo,
  valorOferecidoCentavos,
}: {
  atendimentoId: string
  usuarioId: string
  destinatarioId: string
  escopo: string
  valorOferecidoCentavos: number | null
}): Promise<ResultadoConvite> {
  const texto = escopo.trim()
  if (!texto) return { sucesso: false, motivo: 'vazio' }

  const acesso = await exigirGestor(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  if (destinatarioId === usuarioId) {
    return { sucesso: false, motivo: 'destinatario-invalido' }
  }
  // O Cliente do Atendimento é a outra ponta da relação: ele nunca entra como
  // colaborador do próprio serviço.
  if (destinatarioId === acesso.clienteUsuarioId) {
    return { sucesso: false, motivo: 'destinatario-invalido' }
  }

  const acessoDestinatario = await obterAcessoAtendimento(
    atendimentoId,
    destinatarioId,
  )
  if (acessoDestinatario) return { sucesso: false, motivo: 'ja-participa' }

  await expirarConvitesVencidos()

  try {
    const resultado = await db.transaction(async (tx) => {
      // Só prestador habilitado recebe convite: Profissional aprovado ou
      // Colaborador ativo, com conta ativa e verificada. Mesma porta usada pela
      // colaboração por Cliente — não existe uma segunda definição de "quem
      // pode ser convidado".
      const [destinatario] = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .innerJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(
          and(
            eq(usuarios.id, destinatarioId),
            eq(usuarios.status, 'ativo'),
            condicaoContaVerificada(),
            condicaoPrestadorHabilitado(),
          ),
        )
        .limit(1)

      if (!destinatario) {
        return { sucesso: false as const, motivo: 'destinatario-invalido' as const }
      }

      const agora = new Date()
      const [convite] = await tx
        .insert(atendimentoConvites)
        .values({
          atendimentoId,
          remetenteId: usuarioId,
          destinatarioId,
          escopo: texto,
          valorOferecidoCentavos,
          expiraEm: new Date(
            agora.getTime() + DIAS_VALIDADE_CONVITE_ATENDIMENTO * UM_DIA,
          ),
        })
        .onConflictDoNothing()
        .returning({ id: atendimentoConvites.id })

      if (!convite) {
        return { sucesso: false as const, motivo: 'ja-convidado' as const }
      }

      await tx.insert(atendimentoConviteMensagens).values({
        conviteId: convite.id,
        autorId: usuarioId,
        tipo: valorOferecidoCentavos === null ? 'mensagem' : 'proposta',
        conteudo: texto,
        valorCentavos: valorOferecidoCentavos,
      })

      const nomeConvidado = await nomeDaPessoa(tx, destinatarioId)
      const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
      const nomeRemetente = await nomeDaPessoa(tx, usuarioId)

      await emitirNotificacoes(tx, {
        // Só o convidado. O convite ainda não é um fato do Atendimento para os
        // demais — e o valor combinado não é assunto da equipe inteira.
        destinatarios: [destinatarioId],
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.conviteRecebido,
        titulo: `${nomeRemetente} convidou você para colaborar`,
        resumo: resumirTexto(texto),
        recursoTipo: 'convite',
        recursoId: convite.id,
        atendimentoId,
        protocolo: audiencia?.protocolo ?? null,
        destino: { pagina: 'atendimentos', conviteId: convite.id },
      })

      await tx.insert(atendimentoEventos).values({
        atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.conviteEnviado,
        descricao: `Convite de colaboração enviado a ${nomeConvidado}`,
        autorId: usuarioId,
        // Valor e escopo combinados com um colaborador são acerto entre
        // prestadores. O Cliente contratou um serviço, não a cadeia de quem o
        // executa — nada disto aparece no portal dele.
        visivelCliente: false,
        metadados: { conviteId: convite.id, destinatarioId },
      })

      return {
        sucesso: true as const,
        id: convite.id,
        aviso: {
          destinatarios: [destinatarioId],
          titulo: `${nomeRemetente} convidou você para colaborar`,
          protocolo: audiencia?.protocolo ?? '',
        },
      }
    })

    // O convidado é avisado assim que o convite existe de fato. A difusão fica
    // fora da transação porque um Pusher fora do ar não pode desfazer um
    // convite já gravado.
    if (resultado.sucesso) {
      await difundirNoConvite({
        tipo: 'convite',
        conviteId: resultado.id,
        atendimentoId,
        protocolo: resultado.aviso.protocolo,
        autorId: usuarioId,
        destinatarios: resultado.aviso.destinatarios,
        titulo: resultado.aviso.titulo,
      })
      return { sucesso: true as const, id: resultado.id }
    }

    return resultado
  } catch {
    return { sucesso: false, motivo: 'ja-convidado' }
  }
}

/**
 * Convite visível para quem está pedindo, com o vínculo dele.
 *
 * As duas ponta são as únicas que leem a negociação: quem convidou e quem foi
 * convidado. Nem os demais participantes do Atendimento entram aqui — a
 * negociação é privada por construção, e não por filtro de tela.
 */
export async function obterConviteParaPessoa(
  conviteId: string,
  usuarioId: string,
) {
  const [convite] = await db
    .select({
      id: atendimentoConvites.id,
      atendimentoId: atendimentoConvites.atendimentoId,
      remetenteId: atendimentoConvites.remetenteId,
      destinatarioId: atendimentoConvites.destinatarioId,
      escopo: atendimentoConvites.escopo,
      valorOferecidoCentavos: atendimentoConvites.valorOferecidoCentavos,
      valorContrapropostaCentavos:
        atendimentoConvites.valorContrapropostaCentavos,
      valorAcordadoCentavos: atendimentoConvites.valorAcordadoCentavos,
      status: atendimentoConvites.status,
      expiraEm: atendimentoConvites.expiraEm,
    })
    .from(atendimentoConvites)
    .where(
      and(
        eq(atendimentoConvites.id, conviteId),
        or(
          eq(atendimentoConvites.remetenteId, usuarioId),
          eq(atendimentoConvites.destinatarioId, usuarioId),
        ),
      ),
    )
    .limit(1)

  if (!convite) return null
  return {
    ...convite,
    status: convite.status as StatusConviteAtendimento,
    papel:
      convite.remetenteId === usuarioId
        ? ('remetente' as const)
        : ('destinatario' as const),
  }
}

/**
 * Escreve uma linha na negociação — mensagem, proposta ou correção.
 *
 * É a única porta de escrita da negociação, e por isso o botão da tela é um só:
 * quem escreve informa texto e, opcionalmente, valor. O que aquilo **significa**
 * é decidido aqui, a partir do estado da negociação e do lado da mesa:
 *
 * - sem valor → `mensagem`. Perguntar antes de precificar é um passo legítimo
 *   da conversa, e não uma contraproposta de valor zero;
 * - com valor, vindo de quem convidou → `proposta`;
 * - com valor, vindo de quem foi convidado → `contraproposta`.
 *
 * Correção é o mesmo gesto: quem já tinha um valor daquele lado e manda outro
 * está corrigindo. `valorAnteriorCentavos` guarda o que estava valendo, então o
 * histórico mostra "de 9.500 para 950" com autor e hora, sem que a linha antiga
 * suma. Só o valor vigente conta para o aceite.
 */
export async function escreverNaNegociacao({
  conviteId,
  usuarioId,
  conteudo,
  valorCentavos,
}: {
  conviteId: string
  usuarioId: string
  conteudo: string
  /** Quando presente, a linha carrega valor e vira proposta ou contraproposta. */
  valorCentavos: number | null
}): Promise<ResultadoConvite> {
  const texto = conteudo.trim()
  // Mensagem vazia sem valor não é nada. Com valor, o texto é opcional: mandar
  // só o número é um gesto normal de negociação.
  if (!texto && valorCentavos === null) return { sucesso: false, motivo: 'vazio' }

  const convite = await obterConviteParaPessoa(conviteId, usuarioId)
  if (!convite) return { sucesso: false, motivo: 'sem-acesso' }
  if (convite.status !== 'pendente') {
    return { sucesso: false, motivo: 'encerrado' }
  }
  if (convite.expiraEm <= new Date()) {
    await expirarConvitesVencidos()
    return { sucesso: false, motivo: 'expirado' }
  }

  const ehRemetente = convite.papel === 'remetente'
  const tipo: TipoMensagemNegociacao =
    valorCentavos === null
      ? 'mensagem'
      : ehRemetente
        ? 'proposta'
        : 'contraproposta'

  // O valor que esta linha substitui é o do **próprio lado**: quem convidou
  // corrige a própria oferta, quem foi convidado corrige a própria
  // contraproposta. Nenhum dos dois reescreve o número do outro.
  const valorAnteriorCentavos =
    valorCentavos === null
      ? null
      : ehRemetente
        ? convite.valorOferecidoCentavos
        : convite.valorContrapropostaCentavos

  const gravado = await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(atendimentoConviteMensagens)
      .values({
        conviteId,
        autorId: usuarioId,
        tipo,
        conteudo: texto || descreverValor(valorCentavos, valorAnteriorCentavos),
        valorCentavos,
        valorAnteriorCentavos,
      })
      .returning({ id: atendimentoConviteMensagens.id })

    if (tipo !== 'mensagem') {
      await tx
        .update(atendimentoConvites)
        .set({
          ...(ehRemetente
            ? { valorOferecidoCentavos: valorCentavos }
            : { valorContrapropostaCentavos: valorCentavos }),
          updatedAt: new Date(),
        })
        .where(eq(atendimentoConvites.id, conviteId))
    }

    const aviso = await avisarNegociacao(tx, {
      convite,
      autorId: usuarioId,
      tipo,
      texto,
      valorCentavos,
      corrigiu: valorAnteriorCentavos !== null,
    })

    return { id: linha.id, aviso }
  })

  // A outra ponta vê a linha nova sem recarregar: o canal do convite é privado
  // das duas pessoas, e o payload não carrega o valor — quem receber busca a
  // negociação pela consulta que já confere quem pode lê-la.
  await difundirNoConvite({
    tipo: 'negociacao',
    conviteId,
    atendimentoId: convite.atendimentoId,
    protocolo: gravado.aviso.protocolo,
    autorId: usuarioId,
    destinatarios: [gravado.aviso.outraPonta],
    titulo: gravado.aviso.titulo,
  })

  return { sucesso: true as const, id: gravado.id }
}

/** Texto automático quando a pessoa manda só o número, sem escrever nada. */
function descreverValor(
  valorCentavos: number | null,
  valorAnteriorCentavos: number | null,
) {
  const valor = ((valorCentavos ?? 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  if (valorAnteriorCentavos === null) return `Proposta: ${valor}`
  const anterior = (valorAnteriorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return `Valor corrigido de ${anterior} para ${valor}`
}

/**
 * Avisa a outra ponta da negociação — e só ela.
 *
 * A negociação tem exatamente duas pessoas. Nem os demais participantes do
 * Atendimento nem o Cliente entram nesta lista: para eles, o que dois
 * prestadores combinaram de valor não existe.
 */
async function avisarNegociacao(
  tx: ExecutorDb,
  {
    convite,
    autorId,
    tipo,
    texto,
    valorCentavos,
    corrigiu,
  }: {
    convite: {
      id: string
      atendimentoId: string
      remetenteId: string
      destinatarioId: string
    }
    autorId: string
    tipo: TipoMensagemNegociacao
    texto: string
    valorCentavos: number | null
    corrigiu: boolean
  },
) {
  const outraPonta =
    autorId === convite.remetenteId
      ? convite.destinatarioId
      : convite.remetenteId
  const audiencia = await obterAudienciaDoAtendimento(tx, convite.atendimentoId)
  const autor = await nomeDaPessoa(tx, autorId)
  const protocolo = audiencia?.protocolo ?? ''

  const titulo =
    tipo === 'contraproposta'
      ? corrigiu
        ? `${autor} corrigiu a contraproposta do ${protocolo}`
        : `${autor} enviou uma contraproposta no ${protocolo}`
      : tipo === 'proposta'
        ? corrigiu
          ? `${autor} corrigiu a proposta do ${protocolo}`
          : `${autor} atualizou a proposta do ${protocolo}`
        : `${autor} respondeu ao convite do ${protocolo}`

  await emitirNotificacoes(tx, {
    destinatarios: [outraPonta],
    autorId,
    tipo:
      tipo === 'contraproposta'
        ? TIPOS_NOTIFICACAO.contrapropostaRecebida
        : tipo === 'proposta'
          ? TIPOS_NOTIFICACAO.propostaAtualizada
          : TIPOS_NOTIFICACAO.mensagemNegociacao,
    titulo,
    resumo: resumirTexto(
      texto || descreverValor(valorCentavos, corrigiu ? 0 : null),
    ),
    recursoTipo: 'convite',
    recursoId: convite.id,
    atendimentoId: convite.atendimentoId,
    protocolo: audiencia?.protocolo ?? null,
    destino: { pagina: 'atendimentos', conviteId: convite.id },
  })

  // Devolve o que a difusão em tempo real precisa dizer — a mesma frase e o
  // mesmo destinatário da notificação, para os dois avisos nunca discordarem.
  return { outraPonta, titulo, protocolo }
}

/**
 * Quem convidou adota o valor que o convidado pediu.
 *
 * Atalho de um clique para o que a regra sempre exigiu: contraproposta não vira
 * acordo sozinha, quem convidou precisa repeti-la como proposta. Em vez de
 * obrigar a redigitar o número — de onde sai erro —, o gesto vira uma linha
 * `proposta` com o valor da contraproposta, autor e hora. Depois disso o
 * convidado aceita, e o aceite congela exatamente esse valor.
 */
export async function adotarContraproposta({
  conviteId,
  usuarioId,
}: {
  conviteId: string
  usuarioId: string
}): Promise<ResultadoConvite> {
  const convite = await obterConviteParaPessoa(conviteId, usuarioId)
  if (!convite || convite.papel !== 'remetente') {
    return { sucesso: false, motivo: 'sem-acesso' }
  }
  if (convite.status !== 'pendente') {
    return { sucesso: false, motivo: 'encerrado' }
  }
  if (convite.valorContrapropostaCentavos === null) {
    return { sucesso: false, motivo: 'vazio' }
  }

  return escreverNaNegociacao({
    conviteId,
    usuarioId,
    conteudo: 'Contraproposta aceita. Este passa a ser o valor da proposta.',
    valorCentavos: convite.valorContrapropostaCentavos,
  })
}

/**
 * Resposta do convidado — e só dele.
 *
 * Aceitar congela como valor acordado **a oferta vigente de quem convidou**.
 * Essa é a regra inteira, e ela é assimétrica de propósito: contraproposta não
 * vira acordo sozinha. Para fechar pelo valor da contraproposta, quem convidou
 * precisa repeti-la como proposta — um ato registrado, com autor e hora, e não
 * um número que mudou de dono sem ninguém confirmar.
 *
 * É aqui, e apenas aqui, que o convidado vira participante daquele Atendimento.
 */
export async function responderConvite({
  conviteId,
  usuarioId,
  resposta,
}: {
  conviteId: string
  usuarioId: string
  resposta: 'aceitar' | 'recusar'
}): Promise<
  | { sucesso: true; atendimentoId: string; valorAcordadoCentavos: number | null }
  | { sucesso: false; motivo: MotivoConvite }
> {
  const convite = await obterConviteParaPessoa(conviteId, usuarioId)
  if (!convite || convite.papel !== 'destinatario') {
    return { sucesso: false, motivo: 'sem-acesso' }
  }
  if (convite.status !== 'pendente') {
    return { sucesso: false, motivo: 'encerrado' }
  }
  if (convite.expiraEm <= new Date()) {
    await expirarConvitesVencidos()
    return { sucesso: false, motivo: 'expirado' }
  }

  const agora = new Date()
  const aceitou = resposta === 'aceitar'
  const valorAcordadoCentavos = aceitou ? convite.valorOferecidoCentavos : null

  const resultado = await db.transaction(async (tx) => {
    // A condição de status repetida no `where` é o que torna a resposta segura
    // sob concorrência: dois cliques simultâneos, ou uma revogação chegando ao
    // mesmo tempo, só deixam a primeira operação passar.
    const [respondido] = await tx
      .update(atendimentoConvites)
      .set({
        status: aceitou ? 'aceito' : 'recusado',
        valorAcordadoCentavos,
        respondidoEm: agora,
        updatedAt: agora,
      })
      .where(
        and(
          eq(atendimentoConvites.id, conviteId),
          eq(atendimentoConvites.status, 'pendente'),
        ),
      )
      .returning({ id: atendimentoConvites.id })

    if (!respondido) {
      return { sucesso: false as const, motivo: 'encerrado' as const, aviso: null }
    }

    const nomeConvidado = await nomeDaPessoa(tx, usuarioId)

    if (aceitou) {
      await registrarParticipante(tx, {
        atendimentoId: convite.atendimentoId,
        usuarioId,
        papel: 'convidado',
        conviteId,
      })
      await tx
        .update(atendimentos)
        .set({ updatedAt: agora })
        .where(eq(atendimentos.id, convite.atendimentoId))
    }

    const audiencia = await obterAudienciaDoAtendimento(tx, convite.atendimentoId)
    const titulo = aceitou
      ? `${nomeConvidado} aceitou a colaboração no ${audiencia?.protocolo ?? ''}`
      : `${nomeConvidado} recusou o convite do ${audiencia?.protocolo ?? ''}`
    await emitirNotificacoes(tx, {
      // Quem convidou é quem espera a resposta. Este é o aviso que faltava
      // para a Ana descobrir que o Ricardo respondeu sem abrir convite por
      // convite à procura.
      destinatarios: [convite.remetenteId],
      autorId: usuarioId,
      tipo: aceitou
        ? TIPOS_NOTIFICACAO.conviteAceito
        : TIPOS_NOTIFICACAO.conviteRecusado,
      titulo,
      resumo: aceitou
        ? 'A pessoa passou a participar do atendimento.'
        : 'O convite foi recusado.',
      recursoTipo: 'convite',
      recursoId: conviteId,
      atendimentoId: convite.atendimentoId,
      protocolo: audiencia?.protocolo ?? null,
      destino: { pagina: 'atendimentos', conviteId },
    })

    await tx.insert(atendimentoEventos).values({
      atendimentoId: convite.atendimentoId,
      tipo: aceitou
        ? TIPOS_EVENTO_ATENDIMENTO.conviteAceito
        : TIPOS_EVENTO_ATENDIMENTO.conviteRecusado,
      descricao: aceitou
        ? `${nomeConvidado} aceitou o convite e passou a participar deste atendimento`
        : `${nomeConvidado} recusou o convite de colaboração`,
      autorId: usuarioId,
      visivelCliente: false,
      metadados: { conviteId, valorAcordadoCentavos },
    })

    return {
      sucesso: true as const,
      atendimentoId: convite.atendimentoId,
      valorAcordadoCentavos,
      aviso: { titulo, protocolo: audiencia?.protocolo ?? '' },
    }
  })

  // Quem convidou vê a resposta chegar sem recarregar. No aceite o quadro
  // também muda para o convidado — ele acabou de ganhar um Atendimento —, e o
  // canal pessoal dele leva esse aviso.
  if (resultado.sucesso) {
    await difundirNoConvite({
      tipo: 'convite',
      conviteId,
      atendimentoId: convite.atendimentoId,
      protocolo: resultado.aviso.protocolo,
      autorId: usuarioId,
      destinatarios: [convite.remetenteId],
      titulo: resultado.aviso.titulo,
    })
    return {
      sucesso: true as const,
      atendimentoId: resultado.atendimentoId,
      valorAcordadoCentavos: resultado.valorAcordadoCentavos,
    }
  }

  return { sucesso: false as const, motivo: resultado.motivo }
}

/**
 * Cancela um convite que ainda não foi respondido.
 *
 * Só o convite pendente é cancelável. Depois de aceito, quem sai do Atendimento
 * sai por `removerParticipante`: são coisas diferentes e cada uma deixa o
 * próprio registro.
 */
export async function revogarConvite({
  conviteId,
  usuarioId,
}: {
  conviteId: string
  usuarioId: string
}): Promise<{ sucesso: true } | { sucesso: false; motivo: MotivoConvite }> {
  const [convite] = await db
    .select({
      id: atendimentoConvites.id,
      atendimentoId: atendimentoConvites.atendimentoId,
      destinatarioId: atendimentoConvites.destinatarioId,
    })
    .from(atendimentoConvites)
    .where(eq(atendimentoConvites.id, conviteId))
    .limit(1)

  if (!convite) return { sucesso: false, motivo: 'nao-encontrado' }

  const acesso = await exigirGestor(convite.atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  const agora = new Date()
  const revogacao = await db.transaction(async (tx) => {
    const [revogado] = await tx
      .update(atendimentoConvites)
      .set({
        status: 'revogado',
        revogadoEm: agora,
        revogadoPorId: usuarioId,
        updatedAt: agora,
      })
      .where(
        and(
          eq(atendimentoConvites.id, conviteId),
          eq(atendimentoConvites.status, 'pendente'),
        ),
      )
      .returning({ id: atendimentoConvites.id })

    if (!revogado) {
      return { sucesso: false as const, motivo: 'encerrado' as const, titulo: '', protocolo: '' }
    }

    const nomeConvidado = await nomeDaPessoa(tx, convite.destinatarioId)
    const audienciaRevogada = await obterAudienciaDoAtendimento(
      tx,
      convite.atendimentoId,
    )
    const tituloRevogacao = `Convite do ${audienciaRevogada?.protocolo ?? ''} foi cancelado`
    await emitirNotificacoes(tx, {
      // O convidado precisa saber que não adianta mais responder.
      destinatarios: [convite.destinatarioId],
      autorId: usuarioId,
      tipo: TIPOS_NOTIFICACAO.conviteCancelado,
      titulo: tituloRevogacao,
      resumo: 'A negociação foi encerrada por quem convidou.',
      recursoTipo: 'convite',
      recursoId: conviteId,
      atendimentoId: convite.atendimentoId,
      protocolo: audienciaRevogada?.protocolo ?? null,
      destino: { pagina: 'atendimentos', conviteId },
    })

    await tx.insert(atendimentoEventos).values({
      atendimentoId: convite.atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.conviteRevogado,
      descricao: `Convite de colaboração a ${nomeConvidado} foi cancelado`,
      autorId: usuarioId,
      visivelCliente: false,
      metadados: { conviteId },
    })

    return {
      sucesso: true as const,
      titulo: tituloRevogacao,
      protocolo: audienciaRevogada?.protocolo ?? '',
    }
  })

  if (revogacao.sucesso) {
    await difundirNoConvite({
      tipo: 'convite',
      conviteId,
      atendimentoId: convite.atendimentoId,
      protocolo: revogacao.protocolo,
      autorId: usuarioId,
      destinatarios: [convite.destinatarioId],
      titulo: revogacao.titulo,
    })
    return { sucesso: true as const }
  }

  return { sucesso: false as const, motivo: revogacao.motivo }
}

/**
 * Registra que a pessoa leu a negociação até agora.
 *
 * Abrir a negociação é o gesto que resolve o aviso: a marca de leitura avança e
 * as notificações daquele convite deixam de estar pendentes. As duas coisas
 * andam juntas porque, separadas, a pessoa fecharia a conversa lida e o sino
 * continuaria aceso pedindo que ela voltasse lá.
 *
 * Marcar como lida **não** concede acesso: quem não é uma das duas pontas é
 * recusado antes de qualquer escrita.
 */
export async function marcarNegociacaoComoLida({
  conviteId,
  usuarioId,
}: {
  conviteId: string
  usuarioId: string
}): Promise<{ sucesso: true } | { sucesso: false; motivo: MotivoConvite }> {
  const convite = await obterConviteParaPessoa(conviteId, usuarioId)
  if (!convite) return { sucesso: false, motivo: 'sem-acesso' }

  const agora = new Date()
  await db.transaction(async (tx) => {
    const [ultima] = await tx
      .select({ id: atendimentoConviteMensagens.id })
      .from(atendimentoConviteMensagens)
      .where(eq(atendimentoConviteMensagens.conviteId, conviteId))
      .orderBy(desc(atendimentoConviteMensagens.createdAt))
      .limit(1)

    await registrarLeitura(tx, {
      usuarioId,
      escopo: 'convite',
      recursoId: conviteId,
      canal: 'negociacao',
      lidoAte: agora,
      ultimaMensagemLidaId: ultima?.id ?? null,
    })

    await marcarNotificacoesDoRecursoComoLidas(tx, {
      destinatarioId: usuarioId,
      recursoTipo: 'convite',
      recursoId: conviteId,
    })
  })

  return { sucesso: true }
}
