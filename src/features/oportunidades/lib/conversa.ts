import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidadeMensagens, usuarios } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import {
  calcularNaoLidas,
  chaveDaMarca,
  obterMarcasDeLeitura,
  registrarLeitura,
} from '@/features/atendimentos/lib/leitura'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import type { MensagemDaOportunidadeDTO } from '../types/oportunidade'
import { ESCOPO_LEITURA_OPORTUNIDADE } from './visualizacao'

/**
 * Canal de leitura da **conversa**, distinto do de visualização.
 *
 * `solicitacao` responde "abri este pedido" — é o que o Cliente lê como
 * *visualizada*. `conversa` responde "li as mensagens até aqui". Um canal só
 * faria abrir a lista zerar o contador de mensagens que ninguém leu.
 */
export const CANAL_LEITURA_CONVERSA = 'conversa' as const

/** As mensagens de uma Oportunidade, em ordem, com o nome de quem escreveu. */
export async function mensagensDaOportunidade(
  oportunidadeId: string,
): Promise<MensagemDaOportunidadeDTO[]> {
  const linhas = await db
    .select({
      id: oportunidadeMensagens.id,
      autorId: oportunidadeMensagens.autorId,
      autorNome: usuarios.nome,
      conteudo: oportunidadeMensagens.conteudo,
      criadoEm: oportunidadeMensagens.createdAt,
    })
    .from(oportunidadeMensagens)
    .innerJoin(usuarios, eq(usuarios.id, oportunidadeMensagens.autorId))
    .where(eq(oportunidadeMensagens.oportunidadeId, oportunidadeId))
    .orderBy(asc(oportunidadeMensagens.createdAt))

  return linhas.map((linha) => ({
    id: linha.id,
    autorId: linha.autorId,
    autorNome: linha.autorNome,
    conteudo: linha.conteudo,
    criadoEm: linha.criadoEm.toISOString(),
  }))
}

/** Marca até onde esta pessoa leu a conversa. Nunca anda para trás. */
export async function registrarLeituraDaConversa(
  usuarioId: string,
  oportunidadeId: string,
  lidoAte: Date = new Date(),
) {
  await registrarLeitura(db, {
    usuarioId,
    escopo: ESCOPO_LEITURA_OPORTUNIDADE,
    recursoId: oportunidadeId,
    canal: CANAL_LEITURA_CONVERSA,
    lidoAte,
  })
}

/**
 * Avisa a outra ponta de que chegou mensagem.
 *
 * Mesmo mecanismo do resto do módulo, e sem `chaveDedupe` de propósito: cada
 * mensagem é um fato novo, e agrupá-las esconderia a segunda. `emitirNotificacoes`
 * já descarta o próprio autor, então ninguém é avisado do que escreveu.
 */
export function avisarMensagemDaOportunidade(
  executor: ExecutorDb,
  {
    oportunidadeId,
    destinatarioId,
    autorId,
    autorNome,
    conteudo,
  }: {
    oportunidadeId: string
    destinatarioId: string
    autorId: string
    autorNome: string
    conteudo: string
  },
) {
  return emitirNotificacoes(executor, {
    destinatarios: [destinatarioId],
    autorId,
    tipo: TIPOS_NOTIFICACAO.mensagemOportunidade,
    titulo: `Nova mensagem de ${autorNome}`,
    resumo: resumirTexto(conteudo, 200),
    recursoTipo: 'oportunidade',
    recursoId: oportunidadeId,
    atendimentoId: null,
    protocolo: null,
    destino: { pagina: 'oportunidades', oportunidadeId },
  })
}

/**
 * Quantas mensagens cada conversa tem por ler, para uma pessoa, em lote.
 *
 * Duas consultas para a lista inteira — as mensagens e as marcas —, e a conta
 * em si é `calcularNaoLidas`, a mesma função pura que o quadro de Atendimentos
 * usa: mensagem escrita pela própria pessoa nunca conta, e a marca-d'água
 * decide o resto. Uma ida ao banco por cartão seria um problema de verdade nas
 * 30 solicitações que a lista carrega.
 */
export async function naoLidasPorOportunidade(
  usuarioId: string,
  oportunidadeIds: string[],
): Promise<Map<string, number>> {
  const contagem = new Map<string, number>()
  if (!oportunidadeIds.length) return contagem

  const [mensagens, marcas] = await Promise.all([
    db
      .select({
        id: oportunidadeMensagens.id,
        oportunidadeId: oportunidadeMensagens.oportunidadeId,
        autorId: oportunidadeMensagens.autorId,
        criadoEm: oportunidadeMensagens.createdAt,
      })
      .from(oportunidadeMensagens)
      .where(inArray(oportunidadeMensagens.oportunidadeId, oportunidadeIds))
      .orderBy(asc(oportunidadeMensagens.createdAt)),
    obterMarcasDeLeitura(
      usuarioId,
      ESCOPO_LEITURA_OPORTUNIDADE,
      oportunidadeIds,
    ),
  ])

  const porOportunidade = new Map<string, typeof mensagens>()
  for (const mensagem of mensagens) {
    const lista = porOportunidade.get(mensagem.oportunidadeId) ?? []
    lista.push(mensagem)
    porOportunidade.set(mensagem.oportunidadeId, lista)
  }

  for (const [oportunidadeId, lista] of porOportunidade) {
    const marca = marcas.get(
      chaveDaMarca(oportunidadeId, CANAL_LEITURA_CONVERSA),
    )
    contagem.set(
      oportunidadeId,
      calcularNaoLidas(lista, usuarioId, marca).total,
    )
  }

  return contagem
}
