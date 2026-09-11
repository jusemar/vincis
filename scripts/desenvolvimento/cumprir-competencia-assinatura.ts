/**
 * Marca, em homologação, um mês de assinatura como prestado.
 *
 * Existe porque a operação de prestação ainda não tem tela. Chama exatamente a
 * função de domínio (`cumprirCompetencia`), que também pergunta se o mês já tem
 * direito à comissão recorrente — mês cumprido **e** coberto por pagamento
 * confirmado **e** assinatura originada por parceiro.
 *
 * Sem `--confirmar`, só mostra os meses, a cobertura e as comissões. Com
 * `--confirmar`, cumpre o mês pedido. Repetir não duplica nada.
 *
 * Uso:
 *   VINCIS_AMBIENTE=homologacao node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/cumprir-competencia-assinatura.ts \
 *     <assinatura-id> <numero-do-mes> [--confirmar]
 */
import { asc, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { assinaturaCompetencias, parceiroComissoes } from '../../src/db/schema'
import { ambientePermiteConfirmacaoManual } from '../../src/features/assinaturas/lib/ambiente'
import { coberturaDasCompetencias } from '../../src/features/assinaturas/lib/pagamentos'
import { cumprirCompetencia } from '../../src/features/assinaturas/lib/prestacao'

const [assinaturaId, numeroTexto] = process.argv.slice(2)
const confirmar = process.argv.includes('--confirmar')

if (!assinaturaId || !numeroTexto) {
  console.error('Uso: <assinatura-id> <numero-do-mes> [--confirmar]')
  process.exit(1)
}
if (confirmar && !ambientePermiteConfirmacaoManual()) {
  console.error('Recusado: defina VINCIS_AMBIENTE=homologacao. Nunca em produção.')
  process.exit(1)
}

async function mostrar() {
  const cobertura = await coberturaDasCompetencias(db, assinaturaId)
  const meses = await db
    .select({
      id: assinaturaCompetencias.id,
      numero: assinaturaCompetencias.numero,
      valor: assinaturaCompetencias.valorBaseCentavos,
      status: assinaturaCompetencias.status,
      inicio: assinaturaCompetencias.periodoInicio,
      comissao: parceiroComissoes.valorCentavos,
      percentual: parceiroComissoes.percentual,
      statusComissao: parceiroComissoes.status,
    })
    .from(assinaturaCompetencias)
    .leftJoin(
      parceiroComissoes,
      eq(parceiroComissoes.competenciaId, assinaturaCompetencias.id),
    )
    .where(eq(assinaturaCompetencias.assinaturaId, assinaturaId))
    .orderBy(asc(assinaturaCompetencias.numero))
  console.table(
    meses.map(({ id, ...m }) => ({ ...m, coberto: cobertura.get(id) ?? 0 })),
  )
  return meses
}

const meses = await mostrar()
if (confirmar) {
  const alvo = meses.find((m) => m.numero === Number(numeroTexto))
  if (!alvo) throw new Error('Mês não encontrado nesta assinatura.')
  console.log(await cumprirCompetencia({ competenciaId: alvo.id }))
  await mostrar()
}
await conexaoPostgres.end()
