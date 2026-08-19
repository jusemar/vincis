export {
  arquivarCliente,
  atualizarCliente,
  contarMeusClientesAtivos,
  criarCliente,
  listarMeusClientes,
  obterMeuCliente,
  restaurarCliente,
} from './actions/clientes'
export { contarClientesAtivosProfissional } from './queries/listar-clientes'
export {
  ClienteSchema,
  type ClienteDTO,
  type ClienteValidado,
  type FiltrosClientesDTO,
} from './schemas/cliente'
