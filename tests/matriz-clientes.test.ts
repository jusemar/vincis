import { describe, expect, it } from 'vitest'
import {
  PERMISSOES_POR_NIVEL,
  ehAcessoInterno,
  permissoesDoNivel,
  type NivelAcessoCliente,
} from '@/features/clientes/lib/permissoes-cliente'

const NIVEIS: NivelAcessoCliente[] = [
  'proprietario',
  'escritorio_admin',
  'atribuido',
  'colaborador_externo',
]

describe('matriz de ações sobre o cliente', () => {
  it('todo nível com acesso visualiza', () => {
    for (const nivel of NIVEIS) {
      expect(permissoesDoNivel(nivel).visualizar).toBe(true)
    }
  })

  it('sem nível, nenhuma permissão', () => {
    expect(Object.values(permissoesDoNivel(null))).not.toContain(true)
  })

  it('colaborador externo é somente leitura', () => {
    const externo = PERMISSOES_POR_NIVEL.colaborador_externo
    expect(externo.visualizar).toBe(true)
    expect(externo.editar).toBe(false)
    expect(externo.arquivar).toBe(false)
    expect(externo.restaurar).toBe(false)
    expect(externo.atribuir).toBe(false)
  })

  it('colaborador externo não repassa o acesso adiante', () => {
    expect(PERMISSOES_POR_NIVEL.colaborador_externo.compartilhar).toBe(false)
  })

  it('membro atribuído edita, mas não arquiva nem restaura', () => {
    const atribuido = PERMISSOES_POR_NIVEL.atribuido
    expect(atribuido.editar).toBe(true)
    expect(atribuido.arquivar).toBe(false)
    expect(atribuido.restaurar).toBe(false)
  })

  it('membro atribuído pode pedir colaboração externa', () => {
    expect(PERMISSOES_POR_NIVEL.atribuido.compartilhar).toBe(true)
  })

  it('proprietário do cliente tem acesso completo às ações do próprio cliente', () => {
    const dono = PERMISSOES_POR_NIVEL.proprietario
    expect(dono.editar).toBe(true)
    expect(dono.arquivar).toBe(true)
    expect(dono.restaurar).toBe(true)
    expect(dono.compartilhar).toBe(true)
  })

  it('atribuir cliente é ato administrativo do escritório', () => {
    expect(PERMISSOES_POR_NIVEL.escritorio_admin.atribuir).toBe(true)
    expect(PERMISSOES_POR_NIVEL.proprietario.atribuir).toBe(false)
    expect(PERMISSOES_POR_NIVEL.atribuido.atribuir).toBe(false)
  })

  it('os três primeiros níveis são internos; colaboração externa não é', () => {
    expect(ehAcessoInterno('proprietario')).toBe(true)
    expect(ehAcessoInterno('escritorio_admin')).toBe(true)
    expect(ehAcessoInterno('atribuido')).toBe(true)
    expect(ehAcessoInterno('colaborador_externo')).toBe(false)
  })

  it('compartilhar coincide exatamente com acesso interno', () => {
    for (const nivel of NIVEIS) {
      expect(permissoesDoNivel(nivel).compartilhar).toBe(ehAcessoInterno(nivel))
    }
  })
})
