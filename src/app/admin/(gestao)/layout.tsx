import { AdminShell } from '@/features/admin/components/AdminShell'
import { CentralVincisShell } from '@/features/admin/components/central/CentralVincisShell'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'

/**
 * Moldura e porta da Central Vincis.
 *
 * O grupo de rotas `(gestao)` não muda a URL — os módulos continuam em
 * `/admin/usuarios`, `/admin/comunicados`, `/admin/consultorias` e
 * `/admin/precificacao` —, ele agrupa as telas que compartilham a barra
 * lateral do painel, a navegação da Central e a mesma guarda. Mover as rotas
 * para baixo de `/admin/central/*` só serviria para invalidar links guardados:
 * a hierarquia que importa é a que a pessoa enxerga, e essa vem da navegação.
 *
 * A guarda fica aqui de propósito: o layout renderiza antes das páginas, então
 * quem não é Gestor é desviado antes de qualquer conteúdo ser montado — nada de
 * tela pela metade. As páginas repetem a conferência (cada uma chama
 * `exigirGestorDaPlataforma`) e as actions também, porque uma porta só não
 * cobre quem chama a action direto.
 */
export default async function AdminGestaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await exigirGestorDaPlataforma()

  return (
    <AdminShell>
      <CentralVincisShell>{children}</CentralVincisShell>
    </AdminShell>
  )
}
