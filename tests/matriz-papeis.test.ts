import { describe, expect, it } from 'vitest'
import {
  PAPEIS_ESCRITORIO,
  PERMISSOES_POR_PAPEL,
  papelDoVinculo,
  permissoesEscritorio,
  podeAlterarPapelMembro,
  podeRemoverMembro,
  type PapelEscritorio,
} from '@/features/empresas/lib/papeis-escritorio'
import {
  funcaoAceitaTipo,
  TIPOS_ACEITOS_POR_FUNCAO,
} from '@/features/empresas/lib/compatibilidade-convite'

const EMPRESA = '11111111-1111-1111-1111-111111111111'

function vinculo(funcao: string | null, empresaLegadaId: string | null = null) {
  return { empresaId: EMPRESA, funcao, empresaLegadaId }
}

describe('papel do vínculo', () => {
  it.each(PAPEIS_ESCRITORIO)('reconhece o papel %s', (papel) => {
    expect(papelDoVinculo(vinculo(papel))).toBe(papel)
  })

  it('trata o vínculo legado sem função como proprietário do próprio escritório', () => {
    expect(papelDoVinculo(vinculo(null, EMPRESA))).toBe('proprietario')
  })

  it('não inventa papel para vínculo sem função e sem escritório legado', () => {
    expect(papelDoVinculo(vinculo(null))).toBeNull()
    expect(papelDoVinculo(vinculo(null, 'outro-escritorio'))).toBeNull()
    expect(papelDoVinculo(null)).toBeNull()
  })

  it('não aceita função desconhecida como papel', () => {
    expect(papelDoVinculo(vinculo('super_admin'))).toBeNull()
    expect(permissoesEscritorio(vinculo('super_admin')).administrar).toBe(false)
  })
})

describe('matriz de permissões do escritório', () => {
  it('Proprietário e Administrador administram; membros comuns não', () => {
    expect(PERMISSOES_POR_PAPEL.proprietario.administrar).toBe(true)
    expect(PERMISSOES_POR_PAPEL.administrador.administrar).toBe(true)
    expect(PERMISSOES_POR_PAPEL.profissional.administrar).toBe(false)
    expect(PERMISSOES_POR_PAPEL.colaborador.administrar).toBe(false)
  })

  it('convite permanente é exclusivo de quem administra', () => {
    expect(PERMISSOES_POR_PAPEL.proprietario.convidarMembro).toBe(true)
    expect(PERMISSOES_POR_PAPEL.administrador.convidarMembro).toBe(true)
    expect(PERMISSOES_POR_PAPEL.profissional.convidarMembro).toBe(false)
    expect(PERMISSOES_POR_PAPEL.colaborador.convidarMembro).toBe(false)
  })

  it('a única diferença entre Proprietário e Administrador é a propriedade', () => {
    const proprietario = PERMISSOES_POR_PAPEL.proprietario
    const administrador = PERMISSOES_POR_PAPEL.administrador
    const divergentes = Object.keys(proprietario).filter(
      (chave) =>
        proprietario[chave as keyof typeof proprietario] !==
        administrador[chave as keyof typeof administrador],
    )
    expect(divergentes).toEqual(['transferirPropriedade'])
  })

  it('sem vínculo não há permissão nenhuma', () => {
    expect(Object.values(permissoesEscritorio(null))).not.toContain(true)
  })
})

describe('remoção de membro', () => {
  const dono = vinculo('proprietario')
  const admin = vinculo('administrador')
  const membro = vinculo('profissional')

  it('o Proprietário nunca é removido — nem pelo Administrador', () => {
    expect(podeRemoverMembro(admin, 'proprietario', false)).toBe(false)
    expect(podeRemoverMembro(dono, 'proprietario', false)).toBe(false)
  })

  it('Proprietário e Administrador removem membros comuns', () => {
    expect(podeRemoverMembro(dono, 'profissional', false)).toBe(true)
    expect(podeRemoverMembro(dono, 'colaborador', false)).toBe(true)
    expect(podeRemoverMembro(admin, 'colaborador', false)).toBe(true)
  })

  it('membro comum não remove ninguém', () => {
    expect(podeRemoverMembro(membro, 'colaborador', false)).toBe(false)
  })

  it('ninguém se remove pela administração', () => {
    expect(podeRemoverMembro(dono, 'administrador', true)).toBe(false)
  })
})

describe('alteração de papel', () => {
  const dono = vinculo('proprietario')
  const admin = vinculo('administrador')
  const membro = vinculo('colaborador')

  it('Colaborador nunca vira Proprietário', () => {
    expect(
      podeAlterarPapelMembro(dono, 'colaborador', 'proprietario', 'colaborador'),
    ).toBe(false)
  })

  it('nem um Profissional é promovido a Proprietário por troca de função', () => {
    expect(
      podeAlterarPapelMembro(dono, 'profissional', 'proprietario', 'profissional'),
    ).toBe(false)
  })

  it('o papel do Proprietário não é alterado por ninguém', () => {
    expect(
      podeAlterarPapelMembro(admin, 'proprietario', 'colaborador', 'profissional'),
    ).toBe(false)
    expect(
      podeAlterarPapelMembro(dono, 'proprietario', 'administrador', 'profissional'),
    ).toBe(false)
  })

  it('Colaborador pode virar Administrador sem deixar de ser Colaborador', () => {
    expect(
      podeAlterarPapelMembro(dono, 'colaborador', 'administrador', 'colaborador'),
    ).toBe(true)
  })

  it('Colaborador não assume o papel técnico de Profissional', () => {
    expect(
      podeAlterarPapelMembro(dono, 'colaborador', 'profissional', 'colaborador'),
    ).toBe(false)
  })

  it('Profissional não é rebaixado ao papel de Colaborador', () => {
    expect(
      podeAlterarPapelMembro(dono, 'profissional', 'colaborador', 'profissional'),
    ).toBe(false)
  })

  it('membro comum não altera função de ninguém', () => {
    expect(
      podeAlterarPapelMembro(membro, 'profissional', 'administrador', 'profissional'),
    ).toBe(false)
  })
})

describe('compatibilidade papel × tipo (convite permanente)', () => {
  it('o papel Administrador aceita os dois tipos', () => {
    expect(TIPOS_ACEITOS_POR_FUNCAO.administrador).toEqual([
      'profissional',
      'colaborador',
    ])
  })

  it.each([
    ['profissional', 'profissional', true],
    ['profissional', 'colaborador', false],
    ['colaborador', 'colaborador', true],
    ['colaborador', 'profissional', false],
    ['administrador', 'profissional', true],
    ['administrador', 'colaborador', true],
  ] as const)('papel %s com pessoa %s → %s', (papel, tipo, esperado) => {
    expect(funcaoAceitaTipo(papel, tipo)).toBe(esperado)
  })

  it('proprietário não é papel convidável', () => {
    const papeisConvidaveis = Object.keys(TIPOS_ACEITOS_POR_FUNCAO)
    expect(papeisConvidaveis).not.toContain<PapelEscritorio>('proprietario')
  })
})
