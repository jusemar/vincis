import { AdminShell } from '@/features/admin/components/AdminShell'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { ManualDaVincis } from '@/features/manual/components/ManualDaVincis'

/**
 * Manual da Vincis — treinamento, testes e suporte.
 *
 * Exclusivo do Gestor da Plataforma, com três barreiras: o middleware barra a
 * rota (ela está marcada como exclusiva no registro de recursos), esta página
 * relê sessão e perfil no servidor antes de montar qualquer conteúdo, e o menu
 * só oferece o item a quem é Gestor.
 *
 * Fica fora do grupo `(gestao)` para não herdar a navegação de módulos da
 * Central: o manual tem índice próprio e é consulta, não configuração.
 */
export const metadata = {
  title: 'Manual da Vincis — Treinamento, Testes e Suporte',
}

export default async function ManualDaVincisRoute() {
  await exigirGestorDaPlataforma()

  return (
    <AdminShell>
      <ManualDaVincis />
    </AdminShell>
  )
}
