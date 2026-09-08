import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrazosDeParceiroPage } from '@/features/parceiros/components/gestao/PrazosDeParceiroPage'
import { REFERENCIAS_PRAZO } from '@/features/parceiros/constants/prazo'
import {
  listarPrazosConfigurados,
  obterPrazoVigente,
} from '@/features/parceiros/queries/obter-prazo'

/**
 * Programa de Parceiros, na Gestão Vincis.
 *
 * Uma tela só, com o que a Gestão precisa decidir hoje: por quanto tempo uma
 * indicação continua valendo. Comissão, níveis, cupons e campanhas não estão
 * aqui porque ainda não existem — e uma tela que oferece controles sem função
 * ensina a ignorá-los.
 *
 * Porta fechada por perfil, como as demais telas de `(gestao)`: o layout barra
 * quem não é Gestor, esta página confere de novo e as actions conferem uma
 * terceira vez, porque rota protegida não protege quem chama a action direto.
 */
export default async function ParceirosGestaoRoute() {
  await exigirGestorDaPlataforma()

  const configurados = await listarPrazosConfigurados()
  // O padrão vem da mesma leitura tolerante que a criação da atribuição usa:
  // a tela mostra o número que de fato seria aplicado, e não o que deveria ser.
  const padrao = await obterPrazoVigente(null)

  return (
    <PrazosDeParceiroPage
      padrao={padrao}
      servicos={REFERENCIAS_PRAZO.map((referencia) => ({
        referencia,
        dias: configurados.get(referencia)?.dias ?? null,
      }))}
    />
  )
}
