import { AdminShell } from '@/features/admin/components/AdminShell'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'

/**
 * Moldura e porta das telas exclusivas do Gestor da Plataforma.
 *
 * O grupo de rotas `(gestao)` não muda a URL — os recursos são
 * `/admin/usuarios`, `/admin/comunicados` e `/admin/consultorias` —, ele
 * agrupa as telas que compartilham a mesma barra lateral e o mesmo cabeçalho
 * do painel e, agora, a mesma guarda.
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

  return <AdminShell>{children}</AdminShell>
}
