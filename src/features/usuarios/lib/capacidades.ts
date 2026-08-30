import { tipoPrestadorDoPerfil } from './tipos-pessoa'
import type { PerfilTipo } from '../types'

/**
 * O que uma conta pode fazer, quando isso depende de mais de uma dimensão.
 *
 * Autorização por "qual é o perfil?" funciona enquanto cada conta exerce um
 * papel só. A conta do Gestor da Plataforma quebra essa premissa de propósito:
 * ela administra a Vincis **e** presta serviço **e** precisa contratar, porque
 * é com ela que a plataforma inteira é testada de ponta a ponta. Decisões
 * assim moram aqui, uma vez, em vez de virarem um `if (ehGestor)` repetido em
 * cada action.
 *
 * O módulo é puro — sem banco, sem React, sem `next/*` — para que servidor e
 * componentes de `use client` decidam com exatamente a mesma regra.
 */
export type CapacidadesDaSessao = {
  perfilTipo: PerfilTipo
  ehGestor: boolean
}

/**
 * A conta pode contratar, pedir orçamento, agendar — agir como Cliente.
 *
 * A regra de produto continua a mesma para todo mundo: **quem presta serviço
 * não se passa por cliente**. Um contador não contrata outro contador pela
 * plataforma, e essa restrição não foi afrouxada.
 *
 * A exceção é uma só, e é sobre a natureza da conta e não sobre privilégio: o
 * Gestor da Plataforma existe para operar e testar a Vincis inteira. Barrá-lo
 * aqui deixaria metade do produto sem como ser exercitada por quem responde
 * por ele — e faria "ser Gestor" custar capacidades em vez de somá-las.
 *
 * Isto **não** flexibiliza nada além disto: quem pode contratar continua sem
 * poder contratar o próprio serviço, e continua limitado ao próprio escritório
 * em tudo que é de tenant.
 */
export function podeAgirComoCliente(sessao: CapacidadesDaSessao): boolean {
  if (sessao.ehGestor) return true
  return tipoPrestadorDoPerfil(sessao.perfilTipo) === null
}
