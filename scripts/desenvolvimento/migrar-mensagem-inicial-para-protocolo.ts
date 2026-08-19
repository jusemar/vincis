/**
 * Move para o Protocolo a mensagem inicial que hoje está na Conversa.
 *
 * Nasceu para o `#2026-0003`, criado quando a mensagem da contratação ainda
 * virava mensagem de chat. A partir de agora essa mensagem abre o Protocolo, e
 * este script acerta o que já estava gravado — sem duplicar: a linha sai de
 * `atendimento_mensagens` na mesma transação em que entra em
 * `atendimento_manifestacoes`.
 *
 * É idempotente: se o Protocolo já tem manifestação, não faz nada. E é
 * conservador — só migra a **primeira** mensagem, se ela for do Cliente. A
 * conversa posterior (a resposta do profissional) continua onde está, porque
 * conversa é conversa.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/migrar-mensagem-inicial-para-protocolo.ts [#2026-0003]
 */
import { asc, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentos,
} from '../../src/db/schema'
import { TIPOS_EVENTO_ATENDIMENTO } from '../../src/features/atendimentos/constants/atendimento'

const protocoloAlvo = process.argv[2] ?? '#2026-0003'

const [atendimento] = await db
  .select({
    id: atendimentos.id,
    protocolo: atendimentos.protocolo,
    clienteUsuarioId: atendimentos.clienteUsuarioId,
  })
  .from(atendimentos)
  .where(eq(atendimentos.protocolo, protocoloAlvo))
  .limit(1)

if (!atendimento) {
  throw new Error(`Atendimento ${protocoloAlvo} não encontrado.`)
}

const jaMigrado = await db
  .select({ id: atendimentoManifestacoes.id })
  .from(atendimentoManifestacoes)
  .where(eq(atendimentoManifestacoes.atendimentoId, atendimento.id))
  .limit(1)

if (jaMigrado.length) {
  console.log(`${atendimento.protocolo}: Protocolo já existe. Nada a migrar.`)
  await conexaoPostgres.end()
  process.exit(0)
}

const mensagens = await db
  .select({
    id: atendimentoMensagens.id,
    escopo: atendimentoMensagens.escopo,
    conteudo: atendimentoMensagens.conteudo,
    autorId: atendimentoMensagens.autorId,
    criadoEm: atendimentoMensagens.createdAt,
  })
  .from(atendimentoMensagens)
  .where(eq(atendimentoMensagens.atendimentoId, atendimento.id))
  .orderBy(asc(atendimentoMensagens.createdAt))

const primeira = mensagens[0]

if (
  !primeira ||
  primeira.escopo !== 'cliente' ||
  primeira.autorId !== atendimento.clienteUsuarioId
) {
  console.log(
    `${atendimento.protocolo}: primeira mensagem não é do Cliente. Nada migrado.`,
  )
  await conexaoPostgres.end()
  process.exit(0)
}

await db.transaction(async (tx) => {
  const [manifestacao] = await tx
    .insert(atendimentoManifestacoes)
    .values({
      atendimentoId: atendimento.id,
      autorId: primeira.autorId,
      papelAutor: 'cliente',
      conteudo: primeira.conteudo,
      visibilidade: 'participantes_e_cliente',
      // Data original: o Protocolo foi aberto quando o Cliente escreveu, não
      // agora que o registro mudou de lugar.
      createdAt: primeira.criadoEm,
    })
    .returning({ id: atendimentoManifestacoes.id })

  await tx.insert(atendimentoEventos).values({
    atendimentoId: atendimento.id,
    tipo: TIPOS_EVENTO_ATENDIMENTO.protocoloAberto,
    descricao: 'Protocolo aberto com a manifestação do Cliente',
    autorId: primeira.autorId,
    visivelCliente: true,
    metadados: { manifestacaoId: manifestacao.id, papelAutor: 'cliente' },
    createdAt: primeira.criadoEm,
  })

  // A mesma transação apaga a origem: em nenhum instante o texto existe nos
  // dois canais.
  await tx
    .delete(atendimentoMensagens)
    .where(eq(atendimentoMensagens.id, primeira.id))
})

const restantes = await db
  .select({ id: atendimentoMensagens.id })
  .from(atendimentoMensagens)
  .where(eq(atendimentoMensagens.atendimentoId, atendimento.id))

console.log(
  `${atendimento.protocolo}: mensagem migrada para o Protocolo. ` +
    `Conversa ficou com ${restantes.length} mensagem(ns).`,
)

await conexaoPostgres.end()
