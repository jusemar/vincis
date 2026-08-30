import { describe, expect, it } from 'vitest'
import {
  telaDoEspaco,
  type SituacaoDoEspaco,
} from '@/features/empresas/lib/tela-do-espaco'
import type { EstadoContextoEmpresa } from '@/features/empresas/types'

/**
 * A área administrativa sempre chega a uma tela.
 *
 * Este arquivo existe por causa de um travamento real: o Gestor da Plataforma
 * abria `/admin` e ficava para sempre em "Preparando seu espaço de
 * trabalho...". O provedor esperava pelo contexto de empresa de todo mundo,
 * mas pulava a busca desse contexto justamente para quem não tem escritório —
 * então a espera não tinha nada para esperar.
 *
 * O que se cobra aqui não é só aquele caso: é a invariante que ele violava —
 * "carregando" só pode existir enquanto alguma coisa está de fato a caminho.
 */

const BASE: SituacaoDoEspaco = {
  naAreaAdministrativa: true,
  autenticacaoCarregando: false,
  autenticado: true,
  ehGestor: false,
  contextoCarregando: false,
  contextoAtualizado: true,
  perfilProfissional: true,
  estadoContexto: 'ativo',
}

const ESTADOS: EstadoContextoEmpresa[] = [
  'ativo',
  'perfil_profissional',
  'colaborador',
  'sem_tenant',
  'selecao_necessaria',
  'nao_autenticado',
  'erro',
]

describe('o Gestor da Plataforma', () => {
  it('abre o painel sem esperar por um escritório que ele não tem', () => {
    // O contexto de empresa nunca é buscado para o Gestor — era exatamente
    // esta combinação que travava a tela.
    const situacao: SituacaoDoEspaco = {
      ...BASE,
      ehGestor: true,
      contextoAtualizado: false,
      perfilProfissional: false,
      estadoContexto: 'sem_tenant',
    }
    expect(telaDoEspaco(situacao)).toBe('pronto')
  })

  it('abre em qualquer estado de contexto, porque nenhum se aplica a ele', () => {
    for (const estadoContexto of ESTADOS) {
      for (const contextoAtualizado of [true, false]) {
        expect(
          telaDoEspaco({
            ...BASE,
            ehGestor: true,
            perfilProfissional: false,
            contextoAtualizado,
            estadoContexto,
          }),
          `${estadoContexto} / atualizado=${contextoAtualizado}`,
        ).toBe('pronto')
      }
    }
  })

  it('só espera enquanto a própria sessão está sendo lida', () => {
    expect(
      telaDoEspaco({ ...BASE, ehGestor: true, autenticacaoCarregando: true }),
    ).toBe('carregando')
  })
})

describe('as demais personas continuam como estavam', () => {
  it('o Profissional com escritório ativo entra no painel', () => {
    expect(telaDoEspaco(BASE)).toBe('pronto')
  })

  it('o Profissional espera enquanto o contexto está a caminho', () => {
    expect(telaDoEspaco({ ...BASE, contextoCarregando: true })).toBe('carregando')
    expect(telaDoEspaco({ ...BASE, contextoAtualizado: false })).toBe('carregando')
  })

  it('o Profissional que atua sozinho é estado final', () => {
    expect(
      telaDoEspaco({ ...BASE, estadoContexto: 'perfil_profissional' }),
    ).toBe('pronto')
  })

  it('o Colaborador opera sem escritório próprio', () => {
    expect(
      telaDoEspaco({
        ...BASE,
        perfilProfissional: false,
        estadoContexto: 'colaborador',
      }),
    ).toBe('pronto')
  })

  it('quem pode abrir escritório e não tem vai para o onboarding', () => {
    expect(
      telaDoEspaco({
        ...BASE,
        perfilProfissional: false,
        estadoContexto: 'sem_tenant',
      }),
    ).toBe('onboarding')
  })

  it('o Profissional sem escritório recebe erro com ação, não espera eterna', () => {
    // O escritório dele é criado pelo servidor antes da página renderizar;
    // chegar aqui significa que a criação não aconteceu.
    expect(telaDoEspaco({ ...BASE, estadoContexto: 'sem_tenant' })).toBe('erro')
  })

  it('estado de contexto quebrado vira cartão de erro', () => {
    for (const estadoContexto of [
      'erro',
      'selecao_necessaria',
      'nao_autenticado',
    ] as const) {
      expect(telaDoEspaco({ ...BASE, estadoContexto })).toBe('erro')
    }
  })

  it('sem sessão a moldura redireciona; o provedor não bloqueia', () => {
    expect(
      telaDoEspaco({ ...BASE, autenticado: false, contextoAtualizado: false }),
    ).toBe('pronto')
  })

  it('fora do painel nada é bloqueado, em nenhuma combinação', () => {
    for (const estadoContexto of ESTADOS) {
      expect(
        telaDoEspaco({
          ...BASE,
          naAreaAdministrativa: false,
          autenticacaoCarregando: true,
          contextoAtualizado: false,
          estadoContexto,
        }),
      ).toBe('pronto')
    }
  })
})

describe('a invariante do carregamento', () => {
  it('nunca espera quando não há nada a caminho', () => {
    const booleanos = [true, false]
    let combinacoes = 0

    for (const naAreaAdministrativa of booleanos) {
      for (const autenticacaoCarregando of booleanos) {
        for (const autenticado of booleanos) {
          for (const ehGestor of booleanos) {
            for (const contextoCarregando of booleanos) {
              for (const contextoAtualizado of booleanos) {
                for (const perfilProfissional of booleanos) {
                  for (const estadoContexto of ESTADOS) {
                    const situacao: SituacaoDoEspaco = {
                      naAreaAdministrativa,
                      autenticacaoCarregando,
                      autenticado,
                      ehGestor,
                      contextoCarregando,
                      contextoAtualizado,
                      perfilProfissional,
                      estadoContexto,
                    }
                    combinacoes += 1

                    if (telaDoEspaco(situacao) !== 'carregando') continue

                    // Esperar só se vale a pena: a sessão está sendo lida, ou
                    // o contexto de quem realmente precisa dele está a caminho.
                    const algoAcaminho =
                      autenticacaoCarregando ||
                      (autenticado &&
                        !ehGestor &&
                        (contextoCarregando || !contextoAtualizado))
                    expect(algoAcaminho, JSON.stringify(situacao)).toBe(true)
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(combinacoes).toBe(2 ** 7 * ESTADOS.length)
  })
})
