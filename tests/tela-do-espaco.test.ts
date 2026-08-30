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
 * mas pulava a busca desse contexto justamente para ele — então a espera não
 * tinha nada para esperar.
 *
 * A exceção saiu junto com a premissa que a criava: o Gestor é um usuário
 * completo, carrega contexto como qualquer conta e, quando não tem escritório,
 * recebe do servidor um **estado final** em vez de uma espera.
 *
 * O que se cobra aqui não é só aquele caso: é a invariante que ele violava —
 * "carregando" só pode existir enquanto alguma coisa está de fato a caminho.
 */

const BASE: SituacaoDoEspaco = {
  naAreaAdministrativa: true,
  autenticacaoCarregando: false,
  autenticado: true,
  contextoCarregando: false,
  contextoAtualizado: true,
  perfilProfissional: true,
  estadoContexto: 'ativo',
}

const ESTADOS: EstadoContextoEmpresa[] = [
  'ativo',
  'perfil_profissional',
  'colaborador',
  'gestor_plataforma',
  'sem_tenant',
  'selecao_necessaria',
  'nao_autenticado',
  'erro',
]

describe('o Gestor da Plataforma é um usuário completo', () => {
  it('com escritório, entra no painel como qualquer profissional', () => {
    // Nada aqui menciona "gestor": é essa a correção. O painel dele é o painel
    // do escritório dele, resolvido pelo mesmo caminho de todo mundo.
    expect(telaDoEspaco({ ...BASE, estadoContexto: 'ativo' })).toBe('pronto')
  })

  it('sem escritório, o painel abre para a Gestão da Plataforma', () => {
    // O servidor devolve um estado final — e não `sem_tenant`, que ofereceria
    // um onboarding de escritório que ele não pode concluir sem cadastro de
    // Profissional aprovado.
    expect(
      telaDoEspaco({
        ...BASE,
        perfilProfissional: false,
        estadoContexto: 'gestor_plataforma',
      }),
    ).toBe('pronto')
  })

  it('espera apenas enquanto o contexto dele está a caminho', () => {
    expect(telaDoEspaco({ ...BASE, contextoAtualizado: false })).toBe('carregando')
    expect(
      telaDoEspaco({ ...BASE, autenticacaoCarregando: true }),
    ).toBe('carregando')
  })

  it('sendo Profissional sem escritório, recebe o onboarding normal', () => {
    // A regressão que importa: o cargo não pode mais tirar dele o fluxo de
    // criação de escritório que qualquer Profissional tem.
    expect(
      telaDoEspaco({
        ...BASE,
        perfilProfissional: false,
        estadoContexto: 'sem_tenant',
      }),
    ).toBe('onboarding')
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

  it('quem não administra a plataforma não recebe o estado dela', () => {
    // `gestor_plataforma` só é devolvido pelo servidor a quem é Gestor; se
    // chegar aqui, é estado operacional e a tela abre — a autorização não mora
    // nesta função.
    expect(
      telaDoEspaco({ ...BASE, estadoContexto: 'gestor_plataforma' }),
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
          for (const contextoCarregando of booleanos) {
            for (const contextoAtualizado of booleanos) {
              for (const perfilProfissional of booleanos) {
                for (const estadoContexto of ESTADOS) {
                  const situacao: SituacaoDoEspaco = {
                    naAreaAdministrativa,
                    autenticacaoCarregando,
                    autenticado,
                    contextoCarregando,
                    contextoAtualizado,
                    perfilProfissional,
                    estadoContexto,
                  }
                  combinacoes += 1

                  if (telaDoEspaco(situacao) !== 'carregando') continue

                  // Esperar só se vale a pena: a sessão está sendo lida, ou o
                  // contexto está a caminho.
                  const algoAcaminho =
                    autenticacaoCarregando ||
                    (autenticado && (contextoCarregando || !contextoAtualizado))
                  expect(algoAcaminho, JSON.stringify(situacao)).toBe(true)
                }
              }
            }
          }
        }
      }
    }

    expect(combinacoes).toBe(2 ** 6 * ESTADOS.length)
  })
})
