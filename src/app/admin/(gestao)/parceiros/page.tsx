import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { PrazosDeParceiroPage } from '@/features/parceiros/components/gestao/PrazosDeParceiroPage'
import { SaquesDeParceiroPage } from '@/features/parceiros/components/gestao/SaquesDeParceiroPage'
import { listarSaquesParaGestao } from '@/features/parceiros/queries/listar-saques-gestao'
import { REFERENCIAS_PRAZO } from '@/features/parceiros/constants/prazo'
import {
  listarPrazosConfigurados,
  obterPrazoVigente,
} from '@/features/parceiros/queries/obter-prazo'

/**
 * Programa de Parceiros, na Gestão Vincis.
 *
 * Duas coisas, e só as que existem: por quanto tempo uma indicação continua
 * valendo, e os saques que os parceiros pediram. Níveis, cupons e campanhas não
 * estão aqui porque ainda não existem — e uma tela que oferece controles sem
 * função ensina a ignorá-los.
 *
 * Os saques ficam nesta mesma tela, e não numa rota nova: é o mesmo assunto
 * (Programa de Parceiros) e o mesmo recurso já registrado na Central. Um item
 * de menu por operação faria a Gestão navegar mais para decidir o mesmo.
 *
 * Porta fechada por perfil, como as demais telas de `(gestao)`: o layout barra
 * quem não é Gestor, esta página confere de novo e as actions conferem uma
 * terceira vez, porque rota protegida não protege quem chama a action direto.
 */
export default async function ParceirosGestaoRoute() {
  await exigirGestorDaPlataforma()

  const [configurados, saques] = await Promise.all([
    listarPrazosConfigurados(),
    listarSaquesParaGestao(),
  ])
  // O padrão vem da mesma leitura tolerante que a criação da atribuição usa:
  // a tela mostra o número que de fato seria aplicado, e não o que deveria ser.
  const padrao = await obterPrazoVigente(null)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PrazosDeParceiroPage
        padrao={padrao}
        servicos={REFERENCIAS_PRAZO.map((referencia) => ({
          referencia,
          dias: configurados.get(referencia)?.dias ?? null,
        }))}
      />
      <SaquesDeParceiroPage saques={saques} />
    </div>
  )
}
