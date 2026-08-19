/**
 * Prepara o cenário de isolamento do Protocolo num Atendimento real.
 *
 * Coloca um segundo profissional demo na lista de participantes do Atendimento
 * (o mesmo `atendimento_participantes` que já autoriza quem responde — nenhum
 * convite novo foi inventado) e garante que cada um dos dois tenha escrito uma
 * resposta.
 *
 * Isso é o que torna a regra verificável na tela: com duas respostas de autores
 * diferentes, cada profissional deve ver a manifestação do Cliente e apenas a
 * própria resposta; o Cliente deve ver as duas.
 *
 * As respostas são publicadas pela mesma função que a Server Action usa, então
 * papel, visibilidade e evento de histórico saem das regras reais. É
 * idempotente: rodar de novo não duplica participante nem resposta.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-protocolo-com-dois-participantes.ts [#2026-0003]
 */
import { and, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  atendimentoManifestacoes,
  atendimentoParticipantes,
  atendimentos,
  usuarios,
} from '../../src/db/schema'
import { publicarManifestacaoNoAtendimento } from '../../src/features/atendimentos/lib/manifestacoes'

const protocoloAlvo = process.argv[2] ?? '#2026-0003'
const EMAIL_CONVIDADO = 'demo.profissional.ricardo.mendes@vincis.local'

const [atendimento] = await db
  .select({
    id: atendimentos.id,
    protocolo: atendimentos.protocolo,
    responsavelId: atendimentos.responsavelId,
  })
  .from(atendimentos)
  .where(eq(atendimentos.protocolo, protocoloAlvo))
  .limit(1)

if (!atendimento) throw new Error(`Atendimento ${protocoloAlvo} não encontrado.`)

const [convidado] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.email, EMAIL_CONVIDADO))
  .limit(1)

if (!convidado) throw new Error(`Profissional ${EMAIL_CONVIDADO} não existe.`)

const [jaParticipa] = await db
  .select({ id: atendimentoParticipantes.id })
  .from(atendimentoParticipantes)
  .where(
    and(
      eq(atendimentoParticipantes.atendimentoId, atendimento.id),
      eq(atendimentoParticipantes.usuarioId, convidado.id),
    ),
  )
  .limit(1)

if (jaParticipa) {
  console.log(`${convidado.nome} já é participante de ${atendimento.protocolo}.`)
} else {
  await db.insert(atendimentoParticipantes).values({
    atendimentoId: atendimento.id,
    usuarioId: convidado.id,
    papel: 'convidado',
  })
  console.log(`${convidado.nome} adicionado como convidado.`)
}

const [responsavel] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.id, atendimento.responsavelId))
  .limit(1)

async function garantirResposta(usuarioId: string, nome: string, texto: string) {
  const [existente] = await db
    .select({ id: atendimentoManifestacoes.id })
    .from(atendimentoManifestacoes)
    .where(
      and(
        eq(atendimentoManifestacoes.atendimentoId, atendimento.id),
        eq(atendimentoManifestacoes.autorId, usuarioId),
      ),
    )
    .limit(1)

  if (existente) {
    console.log(`${nome} já respondeu neste protocolo.`)
    return
  }

  const resultado = await publicarManifestacaoNoAtendimento({
    atendimentoId: atendimento.id,
    usuarioId,
    conteudo: texto,
  })

  if (!resultado.sucesso) {
    throw new Error(`Resposta de ${nome} recusada: ${resultado.motivo}`)
  }
  console.log(`Resposta de ${nome} registrada.`)
}

await garantirResposta(
  atendimento.responsavelId,
  responsavel?.nome ?? 'Responsável',
  'Recebi sua solicitação. Vou preparar a abertura do MEI e retorno com a lista de documentos que ainda faltam.',
)

await garantirResposta(
  convidado.id,
  convidado.nome,
  'Complementando pelo lado jurídico: confirme se a atividade pretendida é permitida no MEI antes da abertura.',
)

await conexaoPostgres.end()
