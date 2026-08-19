import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoEventos,
  atendimentoManifestacoes,
} from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import {
  TIPOS_EVENTO_ATENDIMENTO,
  type PapelManifestacao,
  type VisibilidadeManifestacao,
} from '../constants/atendimento'
import { nomeDoAutor, obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento } from './autorizacao'
import { difundirNoAtendimento } from './difusao'
import type { ExecutorDb } from './executor'

/**
 * O Protocolo aceita texto mais longo que o chat: aqui a pessoa descreve um
 * caso, não manda um recado.
 */
export const TAMANHO_MAXIMO_MANIFESTACAO = 8000

export type ResultadoManifestacao =
  | { sucesso: true; id: string; papelAutor: PapelManifestacao }
  | {
      sucesso: false
      motivo:
        'sem-acesso' | 'vazia' | 'referencia-invalida' | 'arquivo-invalido'
    }

/**
 * Papel e visibilidade derivam do vínculo — nunca da requisição.
 *
 * Se a visibilidade viesse do formulário, um participante poderia publicar a
 * própria resposta como se fosse manifestação do Cliente e, com isso, torná-la
 * legível para os outros participantes.
 */
function definirAutoria(vinculo: string): {
  papelAutor: PapelManifestacao
  visibilidade: VisibilidadeManifestacao
} {
  return vinculo === 'cliente'
    ? { papelAutor: 'cliente', visibilidade: 'participantes_e_cliente' }
    : { papelAutor: 'participante', visibilidade: 'autor_e_cliente' }
}

/**
 * Condição de leitura do Protocolo, em SQL.
 *
 * É a mesma expressão usada pela consulta da equipe e pela conferência de
 * referência ao responder — uma regra só, num lugar só:
 *
 * - o Cliente proprietário lê tudo do próprio Atendimento;
 * - qualquer outra pessoa lê as manifestações do Cliente e **apenas as próprias
 *   respostas**.
 */
export function condicaoLeituraManifestacao(
  usuarioId: string,
  ehCliente: boolean,
) {
  if (ehCliente) return sql`true`
  return or(
    eq(atendimentoManifestacoes.visibilidade, 'participantes_e_cliente'),
    eq(atendimentoManifestacoes.autorId, usuarioId),
  )
}

async function contarManifestacoes(
  executor: ExecutorDb,
  atendimentoId: string,
) {
  const [linha] = await executor
    .select({ total: sql<number>`count(*)::int` })
    .from(atendimentoManifestacoes)
    .where(eq(atendimentoManifestacoes.atendimentoId, atendimentoId))
  return linha?.total ?? 0
}

/**
 * Registra o evento de histórico correspondente à manifestação.
 *
 * A descrição é deliberadamente genérica: o histórico é lido por todos os
 * participantes, e informar quem respondeu — ou o que foi respondido — abriria
 * pela lateral a mesma informação que a visibilidade assimétrica protege. Fica
 * o fato ("houve resposta"), sem o conteúdo e sem o autor.
 */
async function registrarEventoDoProtocolo(
  executor: ExecutorDb,
  {
    atendimentoId,
    autorId,
    papelAutor,
    manifestacaoId,
    ehPrimeira,
  }: {
    atendimentoId: string
    autorId: string
    papelAutor: PapelManifestacao
    manifestacaoId: string
    ehPrimeira: boolean
  },
) {
  const tipo = ehPrimeira
    ? TIPOS_EVENTO_ATENDIMENTO.protocoloAberto
    : papelAutor === 'cliente'
      ? TIPOS_EVENTO_ATENDIMENTO.manifestacaoCliente
      : TIPOS_EVENTO_ATENDIMENTO.respostaProtocolo

  const descricao = ehPrimeira
    ? 'Protocolo aberto com a manifestação do Cliente'
    : papelAutor === 'cliente'
      ? 'Cliente registrou uma nova manifestação no protocolo'
      : 'Resposta registrada no protocolo'

  await executor.insert(atendimentoEventos).values({
    atendimentoId,
    tipo,
    descricao,
    autorId,
    // O andamento do Protocolo é do interesse do Cliente: ele vê tudo que
    // acontece no próprio registro formal.
    visivelCliente: true,
    metadados: { manifestacaoId, papelAutor },
  })
}

/**
 * Publica uma manifestação no Protocolo do Atendimento.
 *
 * Vale para os dois lados: o Cliente registra a solicitação ou a dúvida, e
 * quem está autorizado responde. Autorizado é quem já tem vínculo com o
 * Atendimento — prestador, responsável ou participante convidado. Não existe
 * convite novo aqui.
 *
 * Um id de manifestação que o autor não pode ler é recusado como referência: do
 * contrário, responder "àquela linha" viraria uma forma de descobrir que ela
 * existe.
 */
export async function publicarManifestacaoNoAtendimento({
  atendimentoId,
  usuarioId,
  conteudo,
  respondeManifestacaoId,
  arquivoId,
}: {
  atendimentoId: string
  usuarioId: string
  conteudo: string
  respondeManifestacaoId?: string | null
  arquivoId?: string | null
}): Promise<ResultadoManifestacao> {
  const texto = conteudo.trim().slice(0, TAMANHO_MAXIMO_MANIFESTACAO)
  if (!texto) return { sucesso: false, motivo: 'vazia' }

  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  const { papelAutor, visibilidade } = definirAutoria(acesso.vinculo)

  if (respondeManifestacaoId) {
    const [referencia] = await db
      .select({ id: atendimentoManifestacoes.id })
      .from(atendimentoManifestacoes)
      .where(
        and(
          eq(atendimentoManifestacoes.id, respondeManifestacaoId),
          eq(atendimentoManifestacoes.atendimentoId, atendimentoId),
          condicaoLeituraManifestacao(usuarioId, acesso.vinculo === 'cliente'),
        ),
      )
      .limit(1)
    if (!referencia) return { sucesso: false, motivo: 'referencia-invalida' }
  }

  if (arquivoId) {
    // O arquivo citado precisa ser deste Atendimento: um id de outro registro
    // transformaria a citação numa ponte entre carteiras.
    const [arquivo] = await db
      .select({ id: atendimentoArquivos.id })
      .from(atendimentoArquivos)
      .where(
        and(
          eq(atendimentoArquivos.id, arquivoId),
          eq(atendimentoArquivos.atendimentoId, atendimentoId),
        ),
      )
      .limit(1)
    if (!arquivo) return { sucesso: false, motivo: 'arquivo-invalido' }
  }

  const gravado = await db.transaction(async (tx) => {
    const ehPrimeira = (await contarManifestacoes(tx, atendimentoId)) === 0

    const [manifestacao] = await tx
      .insert(atendimentoManifestacoes)
      .values({
        atendimentoId,
        autorId: usuarioId,
        papelAutor,
        conteudo: texto,
        visibilidade,
        respondeManifestacaoId: respondeManifestacaoId ?? null,
        arquivoId: arquivoId ?? null,
      })
      .returning({ id: atendimentoManifestacoes.id })

    await registrarEventoDoProtocolo(tx, {
      atendimentoId,
      autorId: usuarioId,
      papelAutor,
      manifestacaoId: manifestacao.id,
      ehPrimeira,
    })

    let aviso: {
      destinatarios: string[]
      titulo: string
      protocolo: string
    } | null = null
    const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
    if (audiencia) {
      const autor = await nomeDoAutor(tx, usuarioId)
      // O aviso segue a mesma assimetria da visibilidade da manifestação: a do
      // Cliente é de todos, e a resposta de um participante só interessa — e só
      // é legível — para o Cliente. Avisar a equipe inteira de uma resposta
      // `autor_e_cliente` mandaria gente para uma linha que ela não pode ler.
      const destinatarios =
        papelAutor === 'cliente'
          ? audiencia.equipe
          : [audiencia.clienteUsuarioId]

      const titulo =
        papelAutor === 'cliente'
          ? `${autor} registrou uma manifestação no ${audiencia.protocolo}`
          : `${autor} respondeu no protocolo ${audiencia.protocolo}`

      await emitirNotificacoes(tx, {
        destinatarios,
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.manifestacaoProtocolo,
        titulo,
        resumo: resumirTexto(texto),
        recursoTipo: 'atendimento',
        recursoId: atendimentoId,
        atendimentoId,
        protocolo: audiencia.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: audiencia.protocolo,
          aba: 'protocolo',
        },
      })

      aviso = { destinatarios, titulo, protocolo: audiencia.protocolo }
    }

    return { id: manifestacao.id, aviso }
  })

  // O aviso em tempo real repete o recorte da notificação — e nada mais. O
  // texto da manifestação não viaja: quem receber o aviso vai buscar o
  // Protocolo pela consulta de sempre, que aplica a regra assimétrica de
  // visibilidade no SQL. Sem isso o tempo real seria uma porta paralela para
  // uma resposta destinada a outra pessoa.
  if (gravado.aviso) {
    await difundirNoAtendimento({
      tipo: 'manifestacao',
      atendimentoId,
      protocolo: gravado.aviso.protocolo,
      autorId: usuarioId,
      destinatarios: gravado.aviso.destinatarios,
      titulo: gravado.aviso.titulo,
      aba: 'protocolo',
    })
  }

  return { sucesso: true as const, id: gravado.id, papelAutor }
}

/**
 * Abre o Protocolo com a mensagem escrita na contratação.
 *
 * Roda dentro da transação da contratação, sem a conferência de acesso: o
 * vínculo está sendo criado neste exato instante e o autor é o próprio Cliente
 * que a transação acabou de registrar como dono do Atendimento.
 *
 * Esta mensagem existe **somente** no Protocolo. A Conversa começa vazia — o
 * mesmo texto nos dois lugares faria o Cliente ver duas vezes a única coisa que
 * ele escreveu uma vez.
 */
export async function registrarManifestacaoDeContratacao(
  tx: ExecutorDb,
  {
    atendimentoId,
    clienteUsuarioId,
    conteudo,
  }: { atendimentoId: string; clienteUsuarioId: string; conteudo: string },
) {
  const texto = conteudo.trim().slice(0, TAMANHO_MAXIMO_MANIFESTACAO)
  if (!texto) return null

  const [manifestacao] = await tx
    .insert(atendimentoManifestacoes)
    .values({
      atendimentoId,
      autorId: clienteUsuarioId,
      papelAutor: 'cliente',
      conteudo: texto,
      visibilidade: 'participantes_e_cliente',
    })
    .returning({ id: atendimentoManifestacoes.id })

  await registrarEventoDoProtocolo(tx, {
    atendimentoId,
    autorId: clienteUsuarioId,
    papelAutor: 'cliente',
    manifestacaoId: manifestacao.id,
    ehPrimeira: true,
  })

  return manifestacao.id
}

/**
 * Manifestações que uma pessoa pode ler num Atendimento.
 *
 * Existe para o caso pontual (um Atendimento só). As listagens de quadro fazem
 * a mesma leitura em lote, com a mesma condição.
 */
export async function listarManifestacoesVisiveis(
  atendimentoId: string,
  usuarioId: string,
) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return null

  return await db
    .select({
      id: atendimentoManifestacoes.id,
      autorId: atendimentoManifestacoes.autorId,
      papelAutor: atendimentoManifestacoes.papelAutor,
      conteudo: atendimentoManifestacoes.conteudo,
      visibilidade: atendimentoManifestacoes.visibilidade,
      respondeManifestacaoId: atendimentoManifestacoes.respondeManifestacaoId,
      arquivoId: atendimentoManifestacoes.arquivoId,
      criadoEm: atendimentoManifestacoes.createdAt,
    })
    .from(atendimentoManifestacoes)
    .where(
      and(
        eq(atendimentoManifestacoes.atendimentoId, atendimentoId),
        condicaoLeituraManifestacao(usuarioId, acesso.vinculo === 'cliente'),
      ),
    )
    .orderBy(atendimentoManifestacoes.createdAt)
}

/** Só para o script de migração: a primeira manifestação já existe? */
export async function protocoloTemManifestacao(atendimentoId: string) {
  const [linha] = await db
    .select({ id: atendimentoManifestacoes.id })
    .from(atendimentoManifestacoes)
    .where(
      and(
        eq(atendimentoManifestacoes.atendimentoId, atendimentoId),
        isNull(atendimentoManifestacoes.respondeManifestacaoId),
      ),
    )
    .limit(1)
  return Boolean(linha)
}
