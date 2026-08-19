/**
 * Cria o Atendimento das contratações que já existiam antes do Atendimento
 * existir como conceito.
 *
 * A partir de agora toda contratação nova nasce com o Atendimento na mesma
 * transação; este script é só para o histórico anterior. É idempotente: rodar
 * de novo não cria um segundo Atendimento — `garantirAtendimentoDaContratacao`
 * devolve o que já existe.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/gerar-atendimentos-de-contratacoes.ts
 */
import { conexaoPostgres, db } from '../../src/db/connection'
import { contratacoesServico } from '../../src/db/schema'
import { garantirAtendimentoDaContratacao } from '../../src/features/atendimentos/lib/criar-atendimento-da-contratacao'

// Percorre todas: quem já tem Atendimento é reconhecido pela própria função
// idempotente, que devolve o registro existente em vez de criar outro.
const todas = await db
  .select({
    id: contratacoesServico.id,
    servico: contratacoesServico.nomeServicoSnapshot,
  })
  .from(contratacoesServico)

console.log(`${todas.length} contratação(ões) encontrada(s).`)

for (const contratacao of todas) {
  const atendimento = await garantirAtendimentoDaContratacao(db, contratacao.id)
  console.log(
    `${atendimento.jaExistia ? 'já existia' : 'criado    '}  ${atendimento.protocolo}  ${contratacao.servico}`,
  )
}

await conexaoPostgres.end({ timeout: 5 })
