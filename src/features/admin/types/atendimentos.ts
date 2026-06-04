export type Status = "novo" | "andamento" | "aguardando-cliente" | "aguardando-assinatura" | "concluido";
export type Priority = "alta" | "media" | "baixa";
export type Deadline = "normal" | "proximo" | "vencido";
export type Category = "Fiscal" | "RH" | "Jurídico" | "Societário" | "Contábil";
export type Access = "privado" | "compartilhado";

export interface Assignee {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Protocol {
  id: string;
  number: string;
  title: string;
  client: string;
  category: Category;
  priority: Priority;
  deadline: Deadline;
  deadlineLabel: string;
  status: Status;
  messages: number;
  files: number;
  unread?: number;
  access: Access;
  assignees: Assignee[];
  progress?: { done: number; total: number };
  description?: string;
  createdAt: string;
}

export interface ColumnDef {
  id: Status;
  title: string;
  accent: string;
}

export interface FiltersState {
  status: Status[];
  priority: Priority[];
  category: Category[];
  access: Access[];
  deadline: ("vencido" | "proximo" | "normal")[];
  assignee: string[];
  dateFrom: string;
  dateTo: string;
}

export interface NewProtocolData {
  client: string;
  category: Category;
  title: string;
  description: string;
  priority: Priority;
  deadline: string;
  access: Access;
  assignees: Assignee[];
  checklist: string[];
  files: { name: string; size: string }[];
}