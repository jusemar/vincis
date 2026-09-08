import { ShellDoCliente } from '@/features/portal-cliente/components/shell/ShellDoCliente'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/**
 * Moldura e porta da Área do Cliente.
 *
 * A guarda fica aqui de propósito: o layout renderiza antes das páginas, então
 * quem não alcança esta área é desviado antes de qualquer conteúdo ser montado
 * — nada de tela pela metade. As páginas repetem a conferência (todas chamam
 * `exigirClienteDaSessao`, que é memorizada por requisição) porque um layout
 * não cobre quem chama a página por outro caminho, e as actions conferem de
 * novo pelo mesmo motivo.
 *
 * O shell — cabeçalho, menu lateral, largura, navegação mobile — vive aqui e
 * envolve todas as páginas filhas. É o que garante que trocar de área troque só
 * o conteúdo: o menu não remonta, e o estado dele (recolhido, grupo aberto)
 * atravessa a navegação.
 */
export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await exigirClienteDaSessao()

  return <ShellDoCliente>{children}</ShellDoCliente>
}
