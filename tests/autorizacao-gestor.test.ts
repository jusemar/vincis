import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  RECURSOS_ADMIN,
  ROTA_ADMIN,
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
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
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

  it('a mesma lista alimenta o menu de desktop e o de mobile', () => {
    expect(recursosPermitidos({ ehGestor: true })).toHaveLength(
      RECURSOS_ADMIN.length,
    )
    // Nenhum item exclusivo sobra para quem não é Gestor — é o que impede o
    // menu de oferecer uma porta que o servidor vai fechar.
    expect(recursosPermitidos({ ehGestor: false })).toEqual(
      RECURSOS_ADMIN.filter((r) => !r.exclusivoDoGestor),
    )
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
