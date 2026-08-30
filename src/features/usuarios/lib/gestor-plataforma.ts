import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import type { PerfilTipo } from '../types'

/**
 * Fonte única da resposta "esta pessoa é o Gestor da Plataforma?".
 *
 * Antes a mesma pergunta era feita de cinco formas diferentes — comparação de
 * string na action, no middleware, no componente, na rota. Todas concordavam
 * por enquanto; nada garantia que continuassem concordando. Aqui a regra existe
 * uma vez só, e quem precisa dela pergunta em vez de repetir.
 *
 * O módulo é deliberadamente puro: nenhum import de banco, de React ou de
 * `next/*`. É o que permite que o middleware (`src/proxy.ts`), o servidor e os
 * componentes de `use client` decidam com exatamente a mesma função — e o que
 * mantém o bundle do middleware pequeno.
 *
 * Não confunda identificar com autorizar: esta função responde quem é a pessoa
 * a partir de um perfil **já resolvido no servidor** (`resolverAcessoUsuario`,
 * `obterSessaoServidor`). Ela nunca deve ser aplicada a um perfil que veio do
 * navegador. Para fechar uma porta no servidor, use `validarGestorVincis()` ou
 * `exigirGestorDaPlataforma()`, que releem a sessão.
 */
type PortadorDePerfil =
  | PerfilTipo
  | { perfilTipo: PerfilTipo }
  | { perfil: PerfilTipo }
  | null
  | undefined

export function ehGestorPlataforma(alvo: PortadorDePerfil): boolean {
  if (!alvo) return false
  const perfil =
    typeof alvo === 'string'
      ? alvo
      : 'perfilTipo' in alvo
        ? alvo.perfilTipo
        : alvo.perfil
  return perfil === PERFIL_GESTOR_VINCIS
}
