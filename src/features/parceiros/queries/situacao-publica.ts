import { ROTA_CLIENTE } from '@/features/portal-cliente/constants/navegacao'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { obterParceiroDaSessao } from './obter-parceiro'

/**
 * Onde a página pública `/parceiros` deve levar quem clica em "participar".
 *
 * Espelha o fluxo real, sem inventar tela:
 *
 * - `visitante` — sem sessão: entrar ou criar conta (`?entrar=1` abre o login,
 *   que tem "Criar conta");
 * - `pode_ativar` — conta que alcança a área do cliente e ainda não ativou: a
 *   ativação acontece em `/cliente/parceiros`, num clique, sem análise;
 * - `parceiro_ativo` — já tem link: vai direto ao painel;
 * - `sem_area_cliente` — conta (ex.: só profissional) que não alcança a área do
 *   cliente, onde o programa é ativado hoje. A página explica e indica o
 *   contato, em vez de mandar a pessoa para uma porta fechada.
 *
 * Só leitura. Nada aqui ativa programa nem grava visita.
 */
export type SituacaoNaPaginaPublica = 'visitante' | 'pode_ativar' | 'parceiro_ativo' | 'sem_area_cliente'

export async function obterSituacaoNaPaginaPublica(): Promise<SituacaoNaPaginaPublica> {
  try {
    const usuario = await obterSessaoServidor()
    if (!usuario) return 'visitante'
    const acesso = await resolverAcessoUsuario(usuario.id)
    if (!acesso?.areasPermitidas.includes(ROTA_CLIENTE)) return 'sem_area_cliente'
    return (await obterParceiroDaSessao()) ? 'parceiro_ativo' : 'pode_ativar'
  } catch (erro) {
    // A página é vitrine: uma falha aqui não pode derrubá-la. Volta ao caminho
    // de quem não está logado, que sempre funciona.
    console.error('[PARCEIROS] situação da página pública indisponível', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return 'visitante'
  }
}
