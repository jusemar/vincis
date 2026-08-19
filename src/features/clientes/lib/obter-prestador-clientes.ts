/**
 * Nome histórico da porta de entrada dos prestadores na área de clientes.
 *
 * A implementação vive em `usuarios/lib/obter-prestador-sessao.ts`, que é a
 * única versão da regra — antes havia duas cópias com semânticas iguais e
 * mensagens diferentes (esta e a privada de `empresas/actions/equipe.ts`).
 */
export {
  obterPrestadorSessao as obterPrestadorClientes,
  type PrestadorSessao,
} from '@/features/usuarios/lib/obter-prestador-sessao'
