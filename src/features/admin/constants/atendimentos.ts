import type { Assignee, ColumnDef, Protocol } from '../types/atendimentos';

export const COLUMNS: ColumnDef[] = [
  { id: "novo", title: "Novo", accent: "bg-status-new" },
  { id: "andamento", title: "Em andamento", accent: "bg-status-progress" },
  { id: "aguardando-cliente", title: "Aguardando cliente", accent: "bg-status-waiting" },
  { id: "aguardando-assinatura", title: "Aguardando assinatura", accent: "bg-status-sign" },
  { id: "concluido", title: "Concluído", accent: "bg-status-done" },
];

const A = (id: string, name: string, color: string): Assignee => ({
  id,
  name,
  initials: name.split(" ").map((s) => s[0]).slice(0, 2).join(""),
  color,
});

const team = {
  ana: A("u1", "Ana Lima", "bg-rose-500"),
  bruno: A("u2", "Bruno Silva", "bg-blue-500"),
  carla: A("u3", "Carla Souza", "bg-emerald-500"),
  diego: A("u4", "Diego Reis", "bg-violet-500"),
  elisa: A("u5", "Elisa Tavares", "bg-amber-500"),
};

export const MOCK_PROTOCOLS: Protocol[] = [
  {
    id: "p1", number: "#2026-0042", title: "Apuração de impostos mensais",
    client: "Padaria Real Ltda", category: "Fiscal", priority: "alta",
    deadline: "vencido", deadlineLabel: "Vencido há 1 dia", status: "novo",
    messages: 3, files: 2, unread: 2, access: "compartilhado",
    assignees: [team.ana, team.bruno], progress: { done: 1, total: 4 },
    description: "Cliente solicitou revisão da apuração após divergência no DAS.",
    createdAt: "Hoje, 09:12",
  },
  {
    id: "p2", number: "#2026-0041", title: "Admissão novo colaborador",
    client: "Studio Verde Arq.", category: "RH", priority: "media",
    deadline: "proximo", deadlineLabel: "Vence em 2 dias", status: "novo",
    messages: 1, files: 4, access: "privado",
    assignees: [team.carla], progress: { done: 2, total: 5 },
    createdAt: "Hoje, 08:40",
  },
  {
    id: "p3", number: "#2026-0039", title: "Alteração contratual",
    client: "Tech Bravo S.A.", category: "Societário", priority: "alta",
    deadline: "proximo", deadlineLabel: "Vence amanhã", status: "andamento",
    messages: 7, files: 3, unread: 1, access: "compartilhado",
    assignees: [team.diego, team.ana, team.bruno], progress: { done: 3, total: 6 },
    createdAt: "Ontem",
  },
  {
    id: "p4", number: "#2026-0038", title: "Folha de pagamento — abril",
    client: "Café da Esquina", category: "RH", priority: "media",
    deadline: "normal", deadlineLabel: "5 dias restantes", status: "andamento",
    messages: 2, files: 6, access: "compartilhado",
    assignees: [team.carla, team.elisa], progress: { done: 4, total: 7 },
    createdAt: "Ontem",
  },
  {
    id: "p5", number: "#2026-0035", title: "Defesa administrativa ISS",
    client: "Construtora Norte", category: "Jurídico", priority: "alta",
    deadline: "normal", deadlineLabel: "8 dias restantes", status: "aguardando-cliente",
    messages: 4, files: 9, unread: 3, access: "compartilhado",
    assignees: [team.diego, team.ana], progress: { done: 5, total: 8 },
    createdAt: "2 dias atrás",
  },
  {
    id: "p6", number: "#2026-0033", title: "Envio de documentos contábeis",
    client: "Mercadinho Bela Vista", category: "Contábil", priority: "baixa",
    deadline: "normal", deadlineLabel: "10 dias restantes", status: "aguardando-cliente",
    messages: 0, files: 1, access: "privado",
    assignees: [team.bruno], createdAt: "3 dias atrás",
  },
  {
    id: "p7", number: "#2026-0028", title: "Contrato de prestação de serviços",
    client: "Agência Pulse", category: "Jurídico", priority: "media",
    deadline: "proximo", deadlineLabel: "Vence em 2 dias", status: "aguardando-assinatura",
    messages: 5, files: 2, access: "compartilhado",
    assignees: [team.diego, team.elisa], progress: { done: 6, total: 7 },
    createdAt: "4 dias atrás",
  },
  {
    id: "p8", number: "#2026-0021", title: "Encerramento de filial",
    client: "Rede Sabor & Cia", category: "Societário", priority: "baixa",
    deadline: "normal", deadlineLabel: "Concluído ontem", status: "concluido",
    messages: 12, files: 14, access: "compartilhado",
    assignees: [team.ana, team.bruno, team.carla, team.diego], progress: { done: 7, total: 7 },
    createdAt: "1 semana atrás",
  },
  {
    id: "p9", number: "#2026-0019", title: "Declaração anual MEI",
    client: "Ricardo Almeida — MEI", category: "Fiscal", priority: "baixa",
    deadline: "normal", deadlineLabel: "Concluído", status: "concluido",
    messages: 2, files: 3, access: "privado",
    assignees: [team.elisa], progress: { done: 4, total: 4 },
    createdAt: "1 semana atrás",
  },
];
