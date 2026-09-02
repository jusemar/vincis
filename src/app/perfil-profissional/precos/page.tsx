import Link from 'next/link'
import {
  EVENTOS_PRECIFICACAO,
  registrarFalha,
} from '@/features/precificacao/lib/registro'
import { PlanosDoProfissional } from '@/features/precificacao-profissional/components/publico/PlanosDoProfissional'
import { obterPrecificacaoPublicaDoProfissional } from '@/features/precificacao-profissional/queries/precificacao-publica'
import type { PrecificacaoPublicaDoProfissional } from '@/features/precificacao-profissional/types/precificacao-profissional'

type PrecosDoProfissionalRouteProps = {
  searchParams: Promise<{ prestador?: string | string[] }>
}

/**
 * Planos e preços de um Profissional — a página que "Ver planos e preços" abre.
 *
 * ## Lida a cada visita
 *
 * Como `/precos`, e pelo mesmo motivo: sem isto o Next pré-renderizaria a
 * página no `build` e o preço exibido seria o do momento do deploy. Aqui o
 * argumento é ainda mais forte — o valor pertence a uma pessoa que pode
 * republicá-lo a qualquer hora, e ela precisa ver a mudança no ar logo depois
 * de publicar. O recálculo a cada clique continua acontecendo no navegador,
 * sobre a tabela já entregue.
 *
 * ## Falhar aqui não pode virar preço errado
 *
 * A consulta só devolve a tabela quando o prestador aparece publicamente,
 * publicou, e o conjunto de valores dele está completo. Qualquer outra coisa —
 * inclusive banco fora do ar — vira a tela de ausência, e o detalhe técnico
 * fica no log do servidor. Preço de outra pessoa nunca é preenchido com o da
 * Vincis para "não ficar em branco".
 */
export const dynamic = 'force-dynamic'

async function carregar(
  prestadorId: string,
): Promise<PrecificacaoPublicaDoProfissional | null> {
  try {
    return await obterPrecificacaoPublicaDoProfissional(prestadorId)
  } catch (erro) {
    registrarFalha(
      EVENTOS_PRECIFICACAO.calculoFalhou,
      { rota: '/perfil-profissional/precos' },
      erro,
    )
    return null
  }
}

export default async function PrecosDoProfissionalRoute({
  searchParams,
}: PrecosDoProfissionalRouteProps) {
  const params = await searchParams
  const prestadorId = Array.isArray(params.prestador)
    ? params.prestador[0]
    : params.prestador

  const precificacao = prestadorId ? await carregar(prestadorId) : null

  if (!precificacao) return <SemPrecos prestadorId={prestadorId} />

  return (
    <PlanosDoProfissional
      tabela={precificacao.tabela}
      nome={precificacao.nome}
      primeiroNome={precificacao.primeiroNome}
      voltarPara={`/perfil-profissional?prestador=${encodeURIComponent(precificacao.prestadorId)}`}
    />
  )
}

/**
 * Nem todo profissional publica preço, e isso não é um erro.
 *
 * A saída é comercial e não técnica: quem chegou aqui queria contratar alguém,
 * e o caminho continua aberto pelo perfil — onde o pedido de orçamento vive.
 */
function SemPrecos({ prestadorId }: { prestadorId?: string }) {
  const voltar = prestadorId
    ? `/perfil-profissional?prestador=${encodeURIComponent(prestadorId)}`
    : '/profissionais'

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">
          Planos e preços
        </p>
        <h1 className="mt-3 text-2xl font-bold text-foreground">
          Este profissional ainda não publicou uma tabela de preços
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Você pode descrever o que precisa no perfil dele e receber um
          orçamento com o valor exato para a sua empresa.
        </p>
        <Link
          href={voltar}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {prestadorId ? 'Voltar ao perfil' : 'Ver profissionais'}
        </Link>
      </div>
    </main>
  )
}
