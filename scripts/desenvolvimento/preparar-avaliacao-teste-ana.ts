/**
 * Cria — de verdade — a avaliação de um Atendimento concluído da Ana.
 *
 * É o caso de teste principal desta etapa: permite conferir, com dado real na
 * tela, se o card de `/profissionais`, o bloco de métricas do perfil público e
 * a seção "Comentários de clientes" ficaram visualmente idênticos ao modelo
 * aprovado.
 *
 * Nada é inserido à mão: a avaliação passa por `registrarAvaliacao`, com o id
 * do Cliente proprietário do Atendimento — as mesmas regras de propriedade,
 * status e unicidade que a tela aplica. Rodar duas vezes **não** cria duas
 * avaliações: a segunda execução atualiza a mesma linha, exatamente como o
 * Cliente editando a dele.
 *
 * Só lê e escreve avaliação. Status, entrega, Protocolo, arquivos e Conversa do
 * Atendimento não são tocados.
 *
 * Uso:
 *   # lista os Atendimentos concluídos da Ana e o estado da avaliação de cada
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-avaliacao-teste-ana.ts
 *
 *   # avalia o Atendimento indicado
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-avaliacao-teste-ana.ts \
 *     --protocolo "#2026-0007" --nota 5 --comentario "Comentário de teste."
 */
import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { conexaoPostgres, db } from '../../src/db/connection'
import { atendimentos, avaliacoesAtendimento, usuarios } from '../../src/db/schema'
import { registrarAvaliacao } from '../../src/features/avaliacoes/lib/registrar-avaliacao'
import {
  listarAvaliacoesPublicas,
  obterReputacaoDoPrestador,
} from '../../src/features/avaliacoes/queries/reputacao'

const EMAIL_ANA = 'demo.profissional.ana.silva@vincis.local'

if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
  throw new Error('Script de demonstração indisponível em produção.')
}

function argumento(nome: string) {
  const indice = process.argv.indexOf(`--${nome}`)
  return indice >= 0 ? process.argv[indice + 1] : undefined
}

const clienteConta = alias(usuarios, 'cliente_conta')

const [ana] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.email, EMAIL_ANA))
  .limit(1)

if (!ana) throw new Error(`Conta ${EMAIL_ANA} não encontrada.`)

const concluidos = await db
  .select({
    id: atendimentos.id,
    protocolo: atendimentos.protocolo,
    titulo: atendimentos.titulo,
    concluidoEm: atendimentos.concluidoEm,
    clienteUsuarioId: atendimentos.clienteUsuarioId,
    clienteNome: clienteConta.nome,
    avaliacaoNota: avaliacoesAtendimento.nota,
    avaliacaoComentario: avaliacoesAtendimento.comentario,
  })
  .from(atendimentos)
  .innerJoin(clienteConta, eq(clienteConta.id, atendimentos.clienteUsuarioId))
  .leftJoin(
    avaliacoesAtendimento,
    eq(avaliacoesAtendimento.atendimentoId, atendimentos.id),
  )
  .where(eq(atendimentos.prestadorId, ana.id))
  .orderBy(desc(atendimentos.concluidoEm))

const disponiveis = concluidos.filter((linha) => linha.concluidoEm)

const protocoloAlvo = argumento('protocolo')

if (!protocoloAlvo) {
  console.log(`Prestadora: ${ana.nome} (${EMAIL_ANA})`)
  if (!disponiveis.length) {
    console.log('Nenhum Atendimento concluído. Conclua um antes de avaliar.')
  }
  for (const linha of disponiveis) {
    const situacao =
      linha.avaliacaoNota != null
        ? `avaliado com ${linha.avaliacaoNota}★`
        : 'sem avaliação'
    console.log(
      `${linha.protocolo} | ${linha.titulo} | cliente: ${linha.clienteNome} | ${situacao}`,
    )
  }
  const reputacao = await obterReputacaoDoPrestador(ana.id)
  console.log(
    `\nReputação real atual: média ${reputacao.media ?? '—'} · ${reputacao.total} avaliações`,
  )
  await conexaoPostgres.end({ timeout: 5 })
  process.exit(0)
}

const alvo = disponiveis.find((linha) => linha.protocolo === protocoloAlvo)
if (!alvo) {
  throw new Error(
    `Atendimento concluído ${protocoloAlvo} não encontrado para a Ana.`,
  )
}

const nota = Number(argumento('nota') ?? 5)
const comentario =
  argumento('comentario') ??
  'Avaliação de teste: atendimento claro, dentro do prazo e bem explicado.'

// O autor é o Cliente proprietário daquele Atendimento — quem mais o domínio
// recusaria, e é essa recusa que este script depende para provar a regra.
const resultado = await registrarAvaliacao({
  atendimentoId: alvo.id,
  usuarioId: alvo.clienteUsuarioId,
  nota,
  comentario,
})

if (!resultado.sucesso) {
  throw new Error(`Avaliação recusada: ${resultado.motivo}`)
}

console.log(
  `${resultado.criada ? 'Avaliação criada' : 'Avaliação atualizada'} em ${alvo.protocolo}: ${nota}★ por ${alvo.clienteNome}.`,
)

const reputacao = await obterReputacaoDoPrestador(ana.id)
console.log(
  `Reputação real: média ${reputacao.media} (exibida ${((reputacao.mediaEmDecimos ?? 0) / 10).toFixed(1).replace('.', ',')}) · ${reputacao.total} avaliações`,
)
for (const publica of await listarAvaliacoesPublicas(ana.id)) {
  console.log(`  ${'★'.repeat(publica.nota)} "${publica.comentario}" — ${publica.autor}`)
}

await conexaoPostgres.end({ timeout: 5 })
