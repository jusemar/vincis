import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  RECURSOS_ADMIN,
  ROTA_ADMIN,
  modulosDaCentral,
  recursoDaRota,
  recursosPermitidos,
  rotaExigeGestor,
} from '@/features/admin/constants/recursos'
import { criarComunicado } from '@/features/comunicados/actions/comunicados'
import { buscarConsultoriasGestao } from '@/features/consultorias/actions/gestao-consultorias'
import { definirPrazoOportunidade } from '@/features/configuracoes/actions/configuracoes'
import { desativarUsuarioGestao } from '@/features/usuarios/actions/alterar-status-usuario-gestao'
import { excluirUsuarioGestao } from '@/features/usuarios/actions/excluir-usuario-gestao'
import { listarUsuariosGestao } from '@/features/usuarios/actions/listar-usuarios-gestao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { possuiPermissao } from '@/features/usuarios/lib/possui-permissao'
import { buscarPermissoesUsuario } from '@/features/usuarios/queries/buscar-permissoes-usuario'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { buscarCapacidadesUsuario } from '@/features/usuarios/queries/buscar-perfil-principal-usuario'
import { resolverContextoTenant } from '@/features/empresas/lib/resolver-contexto-tenant'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario, type Persona } from './setup/personas'

let cenario: Cenario

beforeAll(async () => {
  cenario = await montarCenario()
})

afterAll(async () => {
  sairDaSessao()
  await limparCenario()
})

/**
 * Todo mundo que usa `/admin` sem ser o Gestor da Plataforma.
 *
 * Inclui o Proprietário e os dois Administradores do escritório — o
 * "administrador comum" deste projeto, que administra o próprio escritório e
 * não a plataforma — além dos membros comuns e de quem não tem vínculo nenhum.
 */
const NAO_GESTORES: Persona[] = [
  'proprietario',
  'adminProfissional',
  'adminColaborador',
  'profissionalMembro',
  'colaboradorMembro',
  'profissionalSozinho',
  'colaboradorSozinho',
  'colaboradorExterno',
  'estranho',
]

/**
 * A decisão do middleware, reproduzida a partir das mesmas funções que ele
 * chama. Testa a regra sem precisar subir um servidor HTTP — e sem copiar a
 * regra para cá, que é o que faria o teste concordar com um bug.
 */
async function rotaLiberada(usuarioId: string, rota: string) {
  const acesso = await resolverAcessoUsuario(usuarioId)
  if (!acesso) return false
  if (!rota.startsWith(ROTA_ADMIN)) return false
  if (acesso.destino !== ROTA_ADMIN) return false
  return !rotaExigeGestor(rota) || ehGestorPlataforma(acesso)
}

describe('registro de recursos administrativos', () => {
  it('classifica como exclusivos os recursos da Gestão da plataforma', () => {
    const exclusivos = RECURSOS_ADMIN.filter((r) => r.exclusivoDoGestor).map(
      (r) => r.rota,
    )
    expect(exclusivos).toEqual([
      '/admin/central',
      '/admin/usuarios',
      '/admin/comunicados',
      '/admin/consultorias',
      // A Precificação nasceu exclusiva: quem define o preço da plataforma é
      // a Vincis, não o escritório que usa o painel.
      '/admin/precificacao',
    ])
  })

  it('reconhece a rota do recurso e as rotas filhas, e só elas', () => {
    expect(rotaExigeGestor('/admin/usuarios')).toBe(true)
    expect(rotaExigeGestor('/admin/usuarios/uuid-qualquer')).toBe(true)
    expect(rotaExigeGestor('/admin/comunicados')).toBe(true)
    expect(rotaExigeGestor('/admin/consultorias')).toBe(true)
    expect(rotaExigeGestor('/admin/precificacao')).toBe(true)
    // Prefixo parecido não herda proteção — nem falta de proteção.
    expect(rotaExigeGestor('/admin/usuarios-relatorio')).toBe(false)
    expect(recursoDaRota('/admin/usuarios-relatorio')).toBeNull()
    expect(rotaExigeGestor('/admin')).toBe(false)
    expect(rotaExigeGestor('/admin?pagina=clients')).toBe(false)
  })

  it('a barra lateral carrega uma porta, e não cinco', () => {
    // Os módulos da plataforma ocupavam cinco linhas na barra de quem opera o
    // próprio escritório. Agora existe a Central, e eles moram dentro dela.
    expect(recursosPermitidos({ ehGestor: true }).map((r) => r.rotulo)).toEqual([
      'Central Vincis',
    ])
    // Nenhum item exclusivo sobra para quem não é Gestor — é o que impede o
    // menu de oferecer uma porta que o servidor vai fechar.
    expect(recursosPermitidos({ ehGestor: false })).toEqual([])
    // A proteção continua valendo para os cinco, e não só para a porta.
    expect(RECURSOS_ADMIN.every((r) => r.exclusivoDoGestor)).toBe(true)
  })

  it('a navegação da Central lista os módulos, na ordem', () => {
    expect(modulosDaCentral().map((m) => [m.rotuloCurto, m.rota])).toEqual([
      ['Visão geral', '/admin/central'],
      ['Usuários', '/admin/usuarios'],
      ['Comunicados', '/admin/comunicados'],
      ['Consultorias', '/admin/consultorias'],
      ['Precificação', '/admin/precificacao'],
    ])
  })
})

describe('identificação do Gestor da Plataforma', () => {
  it('responde pelo perfil resolvido, em qualquer formato', async () => {
    const gestor = await resolverAcessoUsuario(cenario.ids.gestor)
    expect(ehGestorPlataforma(gestor)).toBe(true)
    expect(ehGestorPlataforma('gestor_vincis')).toBe(true)
    expect(ehGestorPlataforma({ perfilTipo: 'gestor_vincis' })).toBe(true)
    expect(ehGestorPlataforma('profissional')).toBe(false)
    expect(ehGestorPlataforma(null)).toBe(false)
    expect(ehGestorPlataforma(undefined)).toBe(false)
  })

  it('nenhum outro perfil é confundido com o Gestor', async () => {
    for (const persona of NAO_GESTORES) {
      const acesso = await resolverAcessoUsuario(cenario.ids[persona])
      expect(ehGestorPlataforma(acesso), persona).toBe(false)
    }
  })
})

describe('persona A — Gestor da Plataforma', () => {
  it('entra em /admin e em todos os recursos exclusivos', async () => {
    expect(await rotaLiberada(cenario.ids.gestor, ROTA_ADMIN)).toBe(true)
    for (const recurso of RECURSOS_ADMIN) {
      expect(await rotaLiberada(cenario.ids.gestor, recurso.rota), recurso.id).toBe(
        true,
      )
    }
    expect(
      await rotaLiberada(cenario.ids.gestor, '/admin/usuarios/qualquer-id'),
    ).toBe(true)
  })

  it('passa em qualquer permissão do RBAC da plataforma', async () => {
    for (const permissao of [
      'usuarios.excluir',
      'auditoria.visualizar',
      'permissao.que.ainda.nao.existe',
    ]) {
      expect(await possuiPermissao(cenario.ids.gestor, permissao), permissao).toBe(
        true,
      )
    }
  })

  it('passa na guarda de servidor e nas actions exclusivas', async () => {
    entrarComo(cenario.tokens.gestor)
    expect(await validarGestorVincis()).not.toBeNull()
    expect((await listarUsuariosGestao({})).sucesso).toBe(true)
    expect((await buscarConsultoriasGestao({})).sucesso).toBe(true)
  })
})

describe('persona B — administrador de escritório (admin comum)', () => {
  it('mantém exatamente as permissões que já tinha, sem herdar as do Gestor', async () => {
    // O override do Gestor não pode vazar para ninguém: para quem não é
    // Gestor, `possuiPermissao` continua respondendo o que está gravado em
    // `perfis_permissoes` — nem uma permissão a mais, nem a menos.
    for (const persona of ['proprietario', 'adminProfissional', 'adminColaborador'] as const) {
      const gravadas = (await buscarPermissoesUsuario(cenario.ids[persona])).map(
        ({ nome }) => nome,
      )
      for (const permissao of [
        ...gravadas,
        'usuarios.excluir',
        'auditoria.visualizar',
        'permissao.que.ainda.nao.existe',
      ]) {
        expect(
          await possuiPermissao(cenario.ids[persona], permissao),
          `${persona} → ${permissao}`,
        ).toBe(gravadas.includes(permissao))
      }
    }
  })

  it('acessa /admin, mas nenhum recurso exclusivo do Gestor', async () => {
    for (const persona of ['proprietario', 'adminProfissional', 'adminColaborador'] as const) {
      expect(await rotaLiberada(cenario.ids[persona], ROTA_ADMIN), persona).toBe(true)
      for (const recurso of RECURSOS_ADMIN) {
        expect(
          await rotaLiberada(cenario.ids[persona], recurso.rota),
          `${persona} → ${recurso.rota}`,
        ).toBe(false)
      }
    }
  })
})

describe('persona C — prestador que usa /admin', () => {
  it('continua entrando no próprio painel', async () => {
    for (const persona of ['profissionalSozinho', 'colaboradorSozinho'] as const) {
      const acesso = await resolverAcessoUsuario(cenario.ids[persona])
      expect(acesso?.destino, persona).toBe(ROTA_ADMIN)
      expect(await rotaLiberada(cenario.ids[persona], ROTA_ADMIN)).toBe(true)
    }
  })

  it('não alcança recurso exclusivo nem vê o menu dele', async () => {
    for (const persona of ['profissionalSozinho', 'colaboradorSozinho'] as const) {
      const acesso = await resolverAcessoUsuario(cenario.ids[persona])
      expect(recursosPermitidos({ ehGestor: ehGestorPlataforma(acesso) })).toEqual(
        [],
      )
      expect(await rotaLiberada(cenario.ids[persona], '/admin/usuarios')).toBe(false)
    }
  })
})

describe('persona D — sem permissão administrativa', () => {
  it('quem não é Gestor não atravessa a guarda de servidor', async () => {
    for (const persona of NAO_GESTORES) {
      entrarComo(cenario.tokens[persona])
      expect(await validarGestorVincis(), persona).toBeNull()
    }
    sairDaSessao()
    expect(await validarGestorVincis()).toBeNull()
  })
})

describe('actions dos recursos exclusivos, chamadas direto', () => {
  /**
   * O caso que esconder menu não cobre: a pessoa não abre a tela, mas dispara
   * a action. Cada uma tem de recusar por conta própria — é por isso que a
   * guarda é repetida na action, e não só na rota.
   */
  it('recusam leitura e escrita de quem não é Gestor', async () => {
    for (const persona of ['proprietario', 'adminProfissional', 'profissionalSozinho'] as const) {
      entrarComo(cenario.tokens[persona])

      expect((await listarUsuariosGestao({})).sucesso, persona).toBe(false)
      expect((await buscarConsultoriasGestao({})).sucesso, persona).toBe(false)
      expect(
        (await criarComunicado({
          tipo: 'aviso',
          titulo: 'Comunicado indevido',
          resumo: 'Não deveria existir',
          conteudo: 'Conteúdo de teste que não pode ser gravado.',
          audiencia: 'todos',
          publicadoEm: '',
        })).sucesso,
        persona,
      ).toBe(false)
      expect(
        (await desativarUsuarioGestao(cenario.ids.estranho)).sucesso,
        persona,
      ).toBe(false)
      expect(
        (await excluirUsuarioGestao(cenario.ids.estranho)).sucesso,
        persona,
      ).toBe(false)
      expect((await definirPrazoOportunidade({ horas: 2 })).sucesso, persona).toBe(
        false,
      )
    }
  })

  it('sem sessão nenhuma action exclusiva responde', async () => {
    sairDaSessao()
    expect((await listarUsuariosGestao({})).sucesso).toBe(false)
    expect((await buscarConsultoriasGestao({})).sucesso).toBe(false)
    expect((await definirPrazoOportunidade({ horas: 2 })).sucesso).toBe(false)
  })
})


describe('o Gestor da Plataforma é um usuário completo', () => {
  it('administrar a Vincis não apaga o perfil operacional da conta', async () => {
    // Era exatamente aqui que a premissa errada morava: `gestor_vincis`
    // liderava a prioridade de perfis e devolvia "gestor" como se fosse a
    // pessoa inteira. Quem administrava a plataforma deixava de ser
    // reconhecido como Profissional e perdia escritório, painel e carteira.
    const comEscritorio = await buscarCapacidadesUsuario(
      cenario.ids.gestorProfissional,
    )
    expect(comEscritorio.ehGestor).toBe(true)
    expect(comEscritorio.perfilOperacional).toBe('profissional')

    const semEscritorio = await buscarCapacidadesUsuario(cenario.ids.gestor)
    expect(semEscritorio.ehGestor).toBe(true)
    // Sem nenhum perfil operacional vinculado, a conta exerce o mínimo.
    expect(semEscritorio.perfilOperacional).toBe('cliente')
  })

  it('com escritório, entra no painel como o Profissional que também é', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.gestorProfissional)
    expect(acesso).toMatchObject({
      perfil: 'profissional',
      ehGestor: true,
      tipoPrestador: 'profissional',
      habilitado: true,
      destino: ROTA_ADMIN,
    })

    const contexto = await resolverContextoTenant(cenario.ids.gestorProfissional)
    expect(contexto.estado).toBe('ativo')
    expect(contexto.contexto?.empresaId).toBe(cenario.empresaGestorId)
  })

  it('sem escritório, o painel abre pela Gestão da Plataforma', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.gestor)
    expect(acesso?.destino).toBe(ROTA_ADMIN)
    expect(acesso?.ehGestor).toBe(true)

    // Estado final vindo do servidor: nem onboarding de escritório (que ele não
    // poderia concluir), nem espera sem fim.
    const contexto = await resolverContextoTenant(cenario.ids.gestor)
    expect(contexto.estado).toBe('gestor_plataforma')
  })

  it('alcança o painel e a área do Cliente, além do próprio destino', async () => {
    for (const persona of ['gestor', 'gestorProfissional'] as const) {
      const acesso = await resolverAcessoUsuario(cenario.ids[persona])
      expect(acesso?.areasPermitidas, persona).toEqual(
        expect.arrayContaining([ROTA_ADMIN, '/cliente']),
      )
      for (const recurso of RECURSOS_ADMIN) {
        expect(
          await rotaLiberada(cenario.ids[persona], recurso.rota),
          `${persona} → ${recurso.rota}`,
        ).toBe(true)
      }
    }
  })

  it('vê o menu do painel e, somado a ele, a Central Vincis', () => {
    expect(recursosPermitidos({ ehGestor: true }).map((r) => r.rotulo)).toEqual([
      'Central Vincis',
    ])
    // Quem não administra a plataforma não recebe a porta — nem os módulos.
    expect(recursosPermitidos({ ehGestor: false })).toEqual([])
    for (const modulo of modulosDaCentral()) {
      expect(rotaExigeGestor(modulo.rota), modulo.rota).toBe(true)
    }
  })

  it('passa nas guardas exclusivas, tendo escritório ou não', async () => {
    for (const persona of ['gestor', 'gestorProfissional'] as const) {
      entrarComo(cenario.tokens[persona])
      expect(await validarGestorVincis(), persona).not.toBeNull()
      expect((await listarUsuariosGestao({})).sucesso, persona).toBe(true)
    }
  })

  it('não ganha o escritório de terceiros por administrar a plataforma', async () => {
    // O privilégio é sobre a plataforma; o tenant continua sendo o dele.
    // Pedir explicitamente o Escritório Alfa não o entrega.
    const forcado = await resolverContextoTenant(
      cenario.ids.gestorProfissional,
      cenario.empresaId,
    )
    expect(forcado.contexto?.empresaId).not.toBe(cenario.empresaId)
    expect(forcado.contexto?.empresaId).toBe(cenario.empresaGestorId)

    // E o Gestor sem escritório não herda nenhum.
    const semEscritorio = await resolverContextoTenant(
      cenario.ids.gestor,
      cenario.empresaId,
    )
    expect(semEscritorio.contexto).toBeUndefined()
    expect(semEscritorio.estado).toBe('gestor_plataforma')
  })
})

describe('as demais personas não mudam', () => {
  it('o Profissional comum segue no próprio painel, sem Gestão da Plataforma', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.proprietario)
    expect(acesso?.ehGestor).toBe(false)
    expect(acesso?.destino).toBe(ROTA_ADMIN)
    expect(acesso?.areasPermitidas).toEqual([ROTA_ADMIN])
    for (const recurso of RECURSOS_ADMIN) {
      expect(
        await rotaLiberada(cenario.ids.proprietario, recurso.rota),
        recurso.rota,
      ).toBe(false)
    }
  })

  it('o Colaborador continua sem privilégio de Gestor', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.colaboradorSozinho)
    expect(acesso?.ehGestor).toBe(false)
    expect(await possuiPermissao(cenario.ids.colaboradorSozinho, 'usuarios.excluir')).toBe(
      false,
    )
  })

  it('quem não é prestador continua indo para a área do Cliente', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.gestor)
    // Comparação de controle: a mesma ausência de prestador leva o Gestor ao
    // painel e levaria qualquer outra conta ao portal do Cliente.
    expect(acesso?.tipoPrestador).toBeNull()
    expect(acesso?.destino).toBe(ROTA_ADMIN)
    expect(acesso?.areasPermitidas).toContain('/cliente')
  })
})


describe('capacidades de Cliente', () => {
  /**
   * A regra que os fluxos de contratar, agendar e pedir orçamento consultam.
   * Ela vive num lugar só justamente para não voltar a ser três condições
   * ligeiramente diferentes espalhadas por três actions.
   */
  it('quem presta serviço continua sem se passar por cliente', () => {
    for (const perfilTipo of ['profissional', 'contador', 'advogado', 'colaborador'] as const) {
      expect(podeAgirComoCliente({ perfilTipo, ehGestor: false }), perfilTipo).toBe(
        false,
      )
    }
    expect(podeAgirComoCliente({ perfilTipo: 'cliente', ehGestor: false })).toBe(true)
  })

  it('o Gestor da Plataforma age como cliente, exerça o que exercer', () => {
    // A conta que administra e testa a Vincis precisa alcançar os dois lados do
    // produto; sem isso, metade dele fica sem como ser exercitada por quem
    // responde por ele.
    for (const perfilTipo of [
      'cliente',
      'profissional',
      'contador',
      'advogado',
      'colaborador',
    ] as const) {
      expect(podeAgirComoCliente({ perfilTipo, ehGestor: true }), perfilTipo).toBe(
        true,
      )
    }
  })

  it('as duas contas gestoras do cenário alcançam a Área do Cliente', async () => {
    for (const persona of ['gestor', 'gestorProfissional'] as const) {
      const acesso = await resolverAcessoUsuario(cenario.ids[persona])
      expect(acesso?.areasPermitidas, persona).toContain('/cliente')
      expect(
        podeAgirComoCliente({
          perfilTipo: acesso!.perfil,
          ehGestor: acesso!.ehGestor,
        }),
        persona,
      ).toBe(true)
    }
  })

  it('o Profissional comum não ganha nada disso', async () => {
    const acesso = await resolverAcessoUsuario(cenario.ids.proprietario)
    expect(acesso?.areasPermitidas).not.toContain('/cliente')
    expect(
      podeAgirComoCliente({
        perfilTipo: acesso!.perfil,
        ehGestor: acesso!.ehGestor,
      }),
    ).toBe(false)
  })
})
