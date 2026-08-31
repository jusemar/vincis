import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  precificacaoAdicionais,
  precificacaoDescontos,
  precificacaoFaixas,
  precificacaoOpcoes,
  precificacaoPrecosBase,
  precificacaoServicos,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import {
  salvarAdicionais,
  salvarDescontos,
  salvarFaixas,
  salvarFatores,
  salvarPrecosBase,
} from '@/features/precificacao/actions/precificacao'
import { impressaoDaSecao } from '@/features/precificacao/lib/impressao'
import {
  obterTabelaDaVitrine,
  obterTabelaPrecificacao,
} from '@/features/precificacao/queries/obter-tabela-precificacao'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import { entrarComo, sairDaSessao } from './setup/sessao'
import { limparCenario, montarCenario, type Cenario, type Persona } from './setup/personas'

/**
 * A Precificação sob pressão.
 *
 * Aqui não se prova que a conta está certa — disso cuidam as âncoras do motor.
 * Prova-se o que acontece quando alguém tenta gravar o impossível, quando duas
 * sessões disputam a mesma seção, quando quem não pode chama a action direto e
 * quando o banco não coopera. O critério é sempre o mesmo: nenhuma
 * configuração inválida pode chegar em silêncio ao cliente como preço.
 */

let cenario: Cenario
let original: TabelaPrecificacao

const NAO_GESTORES: Persona[] = ['proprietario', 'profissionalSozinho', 'estranho']

async function restaurar() {
  for (const p of original.precosBase) {
    await db
      .update(precificacaoPrecosBase)
      .set({ valorCentavos: p.valorCentavos })
      .where(
        and(
          eq(precificacaoPrecosBase.grupo, p.grupo),
          eq(precificacaoPrecosBase.regime, p.regime),
        ),
      )
  }
  for (const s of original.servicos) {
    await db
      .update(precificacaoServicos)
      .set({ multiplicadorMilesimos: s.multiplicadorMilesimos })
      .where(eq(precificacaoServicos.codigo, s.codigo))
  }
  for (const f of original.faixas) {
    await db
      .update(precificacaoFaixas)
      .set({ valorCentavos: f.valorCentavos })
      .where(
        and(
          eq(precificacaoFaixas.grupo, f.grupo),
          eq(precificacaoFaixas.tipo, f.tipo),
          eq(precificacaoFaixas.codigo, f.codigo),
        ),
      )
  }
  for (const d of original.dimensoes) {
    for (const o of d.opcoes) {
      await db
        .update(precificacaoOpcoes)
        .set({ multiplicadorMilesimos: o.multiplicadorMilesimos })
        .where(
          and(
            eq(precificacaoOpcoes.dimensaoCodigo, d.codigo),
            eq(precificacaoOpcoes.codigo, o.codigo),
          ),
        )
    }
  }
  for (const a of original.adicionais) {
    await db
      .update(precificacaoAdicionais)
      .set({ valorMensalCentavos: a.valorMensalCentavos, ativo: a.ativo })
      .where(eq(precificacaoAdicionais.codigo, a.codigo))
  }
  for (const d of original.descontos) {
    await db
      .update(precificacaoDescontos)
      .set({ descontoMilesimos: d.descontoMilesimos })
      .where(eq(precificacaoDescontos.codigo, d.codigo))
  }
}

/** Payload completo de uma seção, partindo do que está salvo. */
type LinhaDePreco = { grupo: string; regime: string; valorReais: number }

async function precosBaseDe(ajuste: (p: LinhaDePreco) => LinhaDePreco = (p) => p) {
  const t = await obterTabelaPrecificacao()
  return {
    impressao: impressaoDaSecao(t, 'precos_base'),
    precos: t.precosBase.map((p) =>
      ajuste({ grupo: p.grupo, regime: p.regime, valorReais: p.valorCentavos / 100 }),
    ),
    acrescimoConsultiva: 35,
  }
}

beforeAll(async () => {
  cenario = await montarCenario()
  original = await obterTabelaPrecificacao()
})

afterAll(async () => {
  sairDaSessao()
  await restaurar()
  await db
    .delete(eventosAuditoria)
    .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))
  await limparCenario()
})

describe('configuração inválida não chega ao banco', () => {
  beforeAll(() => entrarComo(cenario.tokens.gestor))

  it('preço-base zerado é recusado, com a seção apontada', async () => {
    const entrada = await precosBaseDe((p) =>
      p.grupo === 'contabil' && p.regime === 'simples' ? { ...p, valorReais: 0 } : p,
    )
    const resultado = await salvarPrecosBase(entrada)

    expect(resultado.sucesso).toBe(false)
    expect(resultado.secao).toBe('precos_base')
    expect(resultado.mensagem).toMatch(/Simples Nacional|zero/)
    // E o banco não guardou metade: nada mudou.
    expect(await obterTabelaPrecificacao()).toEqual(original)
  })

  it('desconto que zera a mensalidade é recusado', async () => {
    const t = await obterTabelaPrecificacao()
    const resultado = await salvarDescontos({
      impressao: impressaoDaSecao(t, 'descontos'),
      descontos: [{ codigo: 'doze_meses', percentual: 99.9 }],
    })

    expect(resultado.sucesso).toBe(false)
    expect(resultado.secao).toBe('descontos')
    expect(await obterTabelaPrecificacao()).toEqual(original)
  })

  it('desconto de pacote sem economia real é recusado', async () => {
    // Decisão comercial: o Pacote precisa custar menos que a soma. Zerar o
    // desconto o deixaria empatado, e a vitrine anunciaria economia zero.
    const t = await obterTabelaPrecificacao()
    const resultado = await salvarDescontos({
      impressao: impressaoDaSecao(t, 'descontos'),
      descontos: [{ codigo: 'combo', percentual: 0 }],
    })

    expect(resultado.sucesso).toBe(false)
    expect(resultado.campo).toBe('combo')
    expect(resultado.mensagem).toMatch(/economia real em relação à contratação separada/)
    expect(await obterTabelaPrecificacao()).toEqual(original)
  })

  it('prazo maior com desconto menor é recusado', async () => {
    const t = await obterTabelaPrecificacao()
    const resultado = await salvarDescontos({
      impressao: impressaoDaSecao(t, 'descontos'),
      descontos: [
        { codigo: 'seis_meses', percentual: 20 },
        { codigo: 'doze_meses', percentual: 10 },
      ],
    })

    expect(resultado.sucesso).toBe(false)
    expect(resultado.campo).toBe('doze_meses')
    expect(await obterTabelaPrecificacao()).toEqual(original)
  })

  it('nenhuma mensagem de recusa vaza detalhe técnico', async () => {
    const entrada = await precosBaseDe((p) =>
      p.grupo === 'contabil' && p.regime === 'mei' ? { ...p, valorReais: 0 } : p,
    )
    const { mensagem } = await salvarPrecosBase(entrada)
    expect(mensagem).not.toMatch(
      /constraint|violates|bigint|undefined|null|select |insert |update |Drizzle|at Object|Zod/i,
    )
  })

  it('alvo inexistente não é gravado nem confirmado como sucesso', async () => {
    const t = await obterTabelaPrecificacao()
    const resultado = await salvarFaixas({
      impressao: impressaoDaSecao(t, 'notas_fiscais'),
      tipo: 'notas_fiscais',
      faixas: [{ grupo: 'contabil', codigo: 'faixa_inventada', valorReais: 10 }],
    })

    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toMatch(/não existe mais/)
    expect(await obterTabelaPrecificacao()).toEqual(original)
  })

  it('uma alteração legítima passa e é registrada com antes e depois', async () => {
    await db
      .delete(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))

    const entrada = await precosBaseDe((p) =>
      p.regime === 'simples' && p.grupo === 'contabil' ? { ...p, valorReais: 210 } : p,
    )
    expect((await salvarPrecosBase(entrada)).sucesso).toBe(true)

    const [registro] = await db
      .select()
      .from(eventosAuditoria)
      .where(eq(eventosAuditoria.acao, ACOES_AUDITORIA.precificacaoAlterada))

    expect(registro.autorId).toBe(cenario.ids.gestor)
    const metadados = registro.metadados as Record<string, string>
    expect(metadados.secao).toBe('precos_base')
    // O rastro guarda os dois retratos: dá para saber o que mudou, e não só que
    // algo mudou.
    expect(metadados.antes).toContain('contabil/simples=19500')
    expect(metadados.depois).toContain('contabil/simples=21000')

    await restaurar()
  })
})

describe('duas sessões disputando a mesma seção', () => {
  beforeAll(() => entrarComo(cenario.tokens.gestor))

  it('a segunda gravação é recusada e a decisão da primeira permanece', async () => {
    const aberta = await obterTabelaPrecificacao()
    const impressaoDeA = impressaoDaSecao(aberta, 'descontos')

    // Gestor B salva.
    expect(
      (
        await salvarDescontos({
          impressao: impressaoDeA,
          descontos: [{ codigo: 'doze_meses', percentual: 18 }],
        })
      ).sucesso,
    ).toBe(true)

    // Gestor A, com a tela de antes aberta, tenta salvar.
    const conflito = await salvarDescontos({
      impressao: impressaoDeA,
      descontos: [{ codigo: 'doze_meses', percentual: 11 }],
    })

    expect(conflito.sucesso).toBe(false)
    expect(conflito.conflito).toBe(true)
    expect(conflito.mensagem).toMatch(/outra sessão/)
    // Nada de merge automático: o que B decidiu continua de pé.
    const depois = await obterTabelaPrecificacao()
    expect(
      depois.descontos.find((d) => d.codigo === 'doze_meses')?.descontoMilesimos,
    ).toBe(180)

    await restaurar()
  })
})

describe('quem não é Gestor não altera preço', () => {
  it('nenhuma action aceita chamada direta de outro perfil', async () => {
    const t = await obterTabelaPrecificacao()
    const chamadas = [
      () => salvarPrecosBase({ impressao: impressaoDaSecao(t, 'precos_base'), precos: [], acrescimoConsultiva: 35 }),
      () => salvarFaixas({ impressao: impressaoDaSecao(t, 'faturamento'), tipo: 'faturamento', faixas: [] }),
      () => salvarFatores({ impressao: impressaoDaSecao(t, 'fatores:atividade'), dimensao: 'atividade', opcoes: [] }),
      () => salvarAdicionais({ impressao: impressaoDaSecao(t, 'adicionais'), adicionais: [] }),
      () => salvarDescontos({ impressao: impressaoDaSecao(t, 'descontos'), descontos: [] }),
    ]

    for (const persona of NAO_GESTORES) {
      entrarComo(cenario.tokens[persona])
      for (const chamar of chamadas) {
        expect((await chamar()).mensagem, persona).toBe('Operação não autorizada.')
      }
    }
    sairDaSessao()
    for (const chamar of chamadas) expect((await chamar()).sucesso).toBe(false)

    expect(await obterTabelaPrecificacao()).toEqual(original)
  })
})

describe('a vitrine prefere não mostrar preço a mostrar preço errado', () => {
  it('recusa a tabela quando uma garantia comercial cai', async () => {
    // Zera o preço-base direto no banco, como um script de importação faria.
    await db
      .update(precificacaoPrecosBase)
      .set({ valorCentavos: 0 })
      .where(
        and(
          eq(precificacaoPrecosBase.grupo, 'contabil'),
          eq(precificacaoPrecosBase.regime, 'simples'),
        ),
      )

    // A leitura estrutural passa — não falta linha nenhuma…
    await expect(obterTabelaPrecificacao()).resolves.toBeTruthy()
    // …e é a porta da vitrine que barra, porque o preço seria zero.
    await expect(obterTabelaDaVitrine()).rejects.toThrow(/inválida para exibição/)

    await restaurar()
    await expect(obterTabelaDaVitrine()).resolves.toBeTruthy()
  })

  it('recusa a tabela quando falta uma linha estrutural', async () => {
    const removida = original.precosBase.find(
      (p) => p.grupo === 'juridico' && p.regime === 'real',
    )!
    await db
      .delete(precificacaoPrecosBase)
      .where(
        and(
          eq(precificacaoPrecosBase.grupo, 'juridico'),
          eq(precificacaoPrecosBase.regime, 'real'),
        ),
      )

    await expect(obterTabelaDaVitrine()).rejects.toThrow()

    await db.insert(precificacaoPrecosBase).values(removida)
    await expect(obterTabelaDaVitrine()).resolves.toBeTruthy()
  })
})
