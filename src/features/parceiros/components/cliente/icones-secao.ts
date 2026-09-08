import {
  Crown,
  FolderOpen,
  GraduationCap,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessagesSquare,
  Settings,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícone e tinta de cada seção do módulo.
 *
 * Fica fora do registro de navegação porque aquele arquivo é puro — sem React
 * e sem biblioteca de ícones. Aqui mora só o desenho, e uma seção nova sem
 * ícone cai no padrão em vez de sumir do menu.
 *
 * A tinta segue o mesmo critério do resto do módulo: **azul (`info`) é
 * recorrência e fluxo**, âmbar (`primary`) é ganho, nível e ação principal, e o
 * neutro fica para o que não carrega significado próprio.
 */
export const ICONE_DA_SECAO: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  'meu-link': Link2,
  cupons: Ticket,
  leads: UserPlus,
  materiais: FolderOpen,
  'clientes-indicados': Users,
  comissoes: Wallet,
  niveis: Crown,
  campanhas: Megaphone,
  ranking: Trophy,
  comunidade: MessagesSquare,
  academia: GraduationCap,
  configuracoes: Settings,
}

export function iconeDaSecao(id: string): LucideIcon {
  return ICONE_DA_SECAO[id] ?? LayoutDashboard
}
