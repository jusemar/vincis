/**
 * Confirma, em homologação, o pagamento de uma assinatura da Vincis.
 *
 * Existe porque ainda não há gateway. Chama exatamente a função que o webhook
 * vai chamar (`confirmarPagamentoDeAssinatura`), com o provedor
 * `homologacao_manual` — que a própria função recusa fora de homologação.
 * Não há tela, rota nem Server Action: só quem tem acesso ao banco de
 * homologação consegue rodar isto.
 *
 * Sem `--confirmar`, só mostra o contrato, os meses e o que já está coberto.
 * Com `--confirmar`, registra o pagamento. A chave identifica este evento:
 * rodar de novo com a mesma chave devolve o mesmo pagamento, sem duplicar.
 *
 * Uso:
 *   VINCIS_AMBIENTE=homologacao node --env-file=.env.local --import tsx \
 *     scripts/desenvolvimento/confirmar-pagamento-assinatura.ts \
 *     <assinatura-id> <valor-centavos> <chave> [--confirmar]
 */
import { asc, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { assinaturaCompetencias, assinaturas } from '../../src/db/schema'
import { PROVEDOR_HOMOLOGACAO } from '../../src/features/assinaturas/constants/pagamento'
import {
  coberturaDasCompetencias,
  confirmarPagamentoDeAssinatura,
} from '../../src/features/assinaturas/lib/pagamentos'

const [assinaturaId, valorTexto, chave] = process.argv.slice(2)
const confirmar = process.argv.includes('--confirmar')

if (!assinaturaId || !valorTexto || !chave) {
  console.error('Uso: <assinatura-id> <valor-centavos> <chave> [--confirmar]')
  process.exit(1)
}

async function mostrar() {
  const [contrato] = await db
    .select({
      status: assinaturas.status,
      periodicidade: assinaturas.periodicidade,
      total: assinaturas.valorTotalCentavos,
      vigenciaInicio: assinaturas.vigenciaInicio,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
  if (!contrato) throw new Error('Assinatura não encontrada.')
  const cobertura = await coberturaDasCompetencias(db, assinaturaId)
  const meses = await db
    .select()
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
  console.log(contrato)
  console.table(
    meses.map((m) => ({
      numero: m.numero,
      valor: m.valorBaseCentavos,
      coberto: cobertura.get(m.id) ?? 0,
      status: m.status,
      inicio: m.periodoInicio,
      fim: m.periodoFim,
    })),
  )
}

await mostrar()
if (confirmar) {
  const resultado = await confirmarPagamentoDeAssinatura({
    assinaturaId,
    provedor: PROVEDOR_HOMOLOGACAO,
    chaveIdempotencia: chave,
    valorCentavos: Number(valorTexto),
  })
  console.log(resultado)
  await mostrar()
}
await conexaoPostgres.end()
