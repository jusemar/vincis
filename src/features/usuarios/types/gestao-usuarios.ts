import type { PerfilTipo, UsuarioStatus } from "../types";

export type UsuarioGestao = {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilTipo;
  status: UsuarioStatus;
  whatsapp: string | null;
  emailVerificado: boolean;
  /** Identidade confirmada pela Gestão pelo WhatsApp cadastrado. */
  whatsappVerificado: boolean;
  whatsappVerificadoEm: string | null;
  /** Nome do Gestor que confirmou, quando houve confirmação manual. */
  whatsappVerificadoPor: string | null;
  criadoEm: string;
  proprioGestor: boolean;
  statusProfissional: string | null;
  /** Tipo do prestador: `profissional`, `colaborador` ou nulo (sem cadastro). */
  tipoPrestador: string | null;
  tipoProfissional: string | null;
  modalidadeAtuacao: string | null;
  empresaNome: string | null;
  funcaoEmpresa: string | null;
  totalVinculosAtivos: number;
  ultimoLoginEm: string | null;
};

export type ResultadoListaUsuarios = {
  sucesso: boolean;
  mensagem: string;
  usuarios: UsuarioGestao[];
  total: number;
  pagina: number;
  totalPaginas: number;
};
