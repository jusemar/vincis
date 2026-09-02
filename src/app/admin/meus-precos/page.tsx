import { redirect } from 'next/navigation'
import { AdminShell } from '@/features/admin/components/AdminShell'
import { ROTA_ADMIN } from '@/features/admin/constants/recursos'
import {
  EVENTOS_PRECIFICACAO,
  registrarFalha,
} from '@/features/precificacao/lib/registro'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import { MeusPrecosPage } from '@/features/precificacao-profissional/components/painel/MeusPrecosPage'
import { autorizarPrestador } from '@/features/precificacao-profissional/lib/autorizar-prestador'
import {
  obterConfiguracaoDoProfissional,
  obterEstruturaDaGrade,
} from '@/features/precificacao-profissional/queries/obter-configuracao'
import type { ConfiguracaoDoProfissional } from '@/features/precificacao-profissional/types/precificacao-profissional'

/**
 * Onde o Profissional define os próprios preços.
 *
 * ## A porta é a mesma de sempre, e ela fica aqui
 *
 * `autorizarPrestador()` relê sessão e cadastro no banco. O middleware já barra
 * quem não pode abrir `/admin`, mas ele não distingue Cliente de prestador nem
 * sabe se o cadastro está habilitado — e nenhuma dessas duas coisas pode ser
 * decidida pelo menu. As Server Actions conferem uma terceira vez, porque rota
 * protegida não protege quem chama a action direto.
 *
 * ## Fora do grupo `(gestao)`, de propósito
 *
 * As telas de `(gestao)` são exclusivas do Gestor da Vincis e editam a
 * precificação **da plataforma**. Esta é do prestador e edita a tabela **dele**.
 * Colocá-la lá dentro herdaria a guarda errada: o Profissional seria barrado da
 * própria tela, e um Gestor entraria nela sem ser prestador.
 *
 * ## Lida a cada visita
 *
 * Sem isto o Next serviria a configuração do momento do `build` para todo mundo
 * — uma tela pessoal, com o preço de uma pessoa só, congelada no deploy.
 */
export const dynamic = 'force-dynamic'

type Dados = {
  configuracao: ConfiguracaoDoProfissional
  estrutura: TabelaPrecificacao
}

/**
 * A leitura é tratada aqui, e não deixada para a fronteira de erro.
 *
 * A grade de referência pode não ser lida — banco fora do ar, configuração da
 * Vincis incoerente. Nesse caso a tela explica o que houve em vez de sumir, e o
 * detalhe técnico fica no log. Mesmo desenho de `/precos` e de
 * `/admin/precificacao`.
 */
async function carregar(profissionalId: string): Promise<Dados | null> {
  try {
    const [configuracao, estrutura] = await Promise.all([
      obterConfiguracaoDoProfissional(profissionalId),
      obterEstruturaDaGrade(),
    ])
    return configuracao ? { configuracao, estrutura } : null
  } catch (erro) {
    registrarFalha(
      EVENTOS_PRECIFICACAO.carregar,
      { rota: '/admin/meus-precos' },
      erro,
    )
    return null
  }
}

export default async function MeusPrecosRoute() {
  const prestador = await autorizarPrestador()
  if (!prestador) redirect(ROTA_ADMIN)

  const dados = await carregar(prestador.id)

  return (
    <AdminShell>
      {dados ? (
        <MeusPrecosPage
          configuracao={dados.configuracao}
          estrutura={dados.estrutura}
        />
      ) : (
        <PrecosIndisponiveis />
      )}
    </AdminShell>
  )
}

function PrecosIndisponiveis() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-lg font-semibold text-foreground">
        Não foi possível abrir seus preços agora
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        A configuração de referência da plataforma não pôde ser lida. Nada do
        que você já publicou foi alterado — tente novamente em instantes.
      </p>
    </div>
  )
}
