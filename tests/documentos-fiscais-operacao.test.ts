import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clientes,
  documentosFiscais,
  documentosFiscaisArquivos,
  documentosFiscaisEventos,
  documentosFiscaisExtracoes,
  eventosAuditoria,
  perfisPermissoes,
} from '@/db/schema'
import {
  LIMITE_REPROCESSAMENTO_EM_LOTE,
  LIMITE_REVISAO_EM_LOTE,
  ORDENS_DOCUMENTOS_FISCAIS,
  precisaDeAtencao,
} from '@/features/documentos-fiscais/constants/operacao-fiscal'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '@/features/documentos-fiscais/constants/permissoes'
import { resolverAcessoDocumentosFiscais } from '@/features/documentos-fiscais/lib/acesso-documentos-fiscais'
import {
  listarDocumentosFiscais,
  type FiltrosDocumentosFiscais,
} from '@/features/documentos-fiscais/queries/listar-documentos-fiscais'
import {
  lerFiltrosDocumentosFiscais,
  montarBuscaDocumentosFiscais,
} from '@/features/documentos-fiscais/schemas/filtros-documentos-fiscais'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'
import { entrarComo, sairDaSessao } from './setup/sessao'

/*
  Fase 1.9 — operação da Central Fiscal: seleção, ações em lote, ordenação,
  recorte de pendências e preservação de contexto. Só o armazenamento é
  simulado.
*/

const armazenamento = vi.hoisted(() => ({ objetos: new Map<string, Uint8Array>() }))

vi.mock('@/features/documentos-fiscais/lib/armazenamento-fiscal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/documentos-fiscais/lib/armazenamento-fiscal')>()
  return {
    montarChaveOriginal: original.montarChaveOriginal,
    gravarOriginalPrivado: async (chave: string, bytes: Uint8Array) => {
      if (armazenamento.objetos.has(chave)) throw new Error('sobrescrita recusada')
      armazenamento.objetos.set(chave, bytes.slice())
      return { chave }
    },
    lerOriginalPrivado: async (chave: string) => {
      const bytes = armazenamento.objetos.get(chave)
      return bytes ? { stream: new Blob([bytes.slice()]).stream() } : null
    },
    descartarObjetoNaoRegistrado: async (chave: string) => {
      armazenamento.objetos.delete(chave)
    },
  }
})

const { receberXmlsFiscais } = await import('@/features/documentos-fiscais/lib/receber-xml-fiscal')
const { revisarDocumentosFiscaisEmLote, marcarDocumentoFiscalRevisado } = await import(
  '@/features/documentos-fiscais/actions/revisar-documento'
)
const { reprocessarDocumentosFiscaisEmLote } = await import(
  '@/features/documentos-fiscais/actions/reprocessar-documento'
)

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'
const CNPJ_EMITENTE = '12345678000195'

const lerFixture = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8')

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

function nfe({ emissao, valor }: { emissao: string; valor?: string }) {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  const base = lerFixture('nfe-proc-completa.xml')
    .replaceAll(CHAVE_FIXTURE, chave)
    .replace('<nNF>1</nNF>', `<nNF>${sequencia}</nNF>`)
    .replace('<dhEmi>2026-09-15T10:20:30-03:00</dhEmi>', `<dhEmi>${emissao}T10:00:00-03:00</dhEmi>`)
  return valor ? base.replace('<vNF>376.01</vNF>', `<vNF>${valor}</vNF>`) : base
}

/** Fixture de leiaute não suportado, com chave nova a cada chamada. */
function nfeNaoInterpretada() {
  sequencia += 1
  const original = '35260912345678000195550010000000041000000041'
  const chave = `${original.slice(0, 35)}${String(sequencia).padStart(8, '0')}1`
  return lerFixture('nfe-versao-nao-suportada.xml').replaceAll(original, chave)
}

async function importar(xml: string, clienteId: string | null, empresaId = cenario.empresaId, persona: keyof Cenario['ids'] = 'proprietario') {
  const resultado = await receberXmlsFiscais({
    usuarioId: cenario.ids[persona],
    empresaId,
    clienteId,
    arquivos: [new File([xml], `nfe-${sequencia}.xml`, { type: 'application/xml' })],
  })
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
}

async function aceito(xml: string, clienteId: string | null) {
  const item = await importar(xml, clienteId)
  if (item.codigo !== 'ACEITO') throw new Error(`esperava ACEITO, veio ${item.codigo}`)
  return item.documentoId
}

const FILTROS_VAZIOS: FiltrosDocumentosFiscais = {
  pagina: 1,
  clienteId: null,
  sentido: null,
  processamento: null,
  revisao: null,
  de: null,
  ate: null,
  busca: null,
  atencao: false,
  ordem: null,
}

async function acessoDe(persona: keyof Cenario['ids'], empresaId = cenario.empresaId) {
  const acesso = await resolverAcessoDocumentosFiscais(
    cenario.ids[persona],
    PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
    empresaId,
  )
  if (!acesso) throw new Error(`sem acesso fiscal: ${persona}`)
  return acesso
}

const listar = async (persona: keyof Cenario['ids'], filtros: Partial<FiltrosDocumentosFiscais> = {}) =>
  listarDocumentosFiscais(await acessoDe(persona), { ...FILTROS_VAZIOS, ...filtros })

const statusDe = async (documentoId: string) =>
  (
    await db
      .select({
        revisao: documentosFiscais.statusRevisao,
        processamento: documentosFiscais.statusProcessamento,
        revisadoPorId: documentosFiscais.revisadoPorId,
      })
      .from(documentosFiscais)
      .where(eq(documentosFiscais.id, documentoId))
  )[0]

async function limparFiscal() {
  if (!cenario) return
  const empresas = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresas))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscais).where(inArray(documentosFiscais.id, ids))
  }
  await db.delete(eventosAuditoria).where(and(like(eventosAuditoria.acao, 'documento_fiscal_%'), inArray(eventosAuditoria.empresaId, empresas)))
  armazenamento.objetos.clear()
}

beforeAll(async () => {
  cenario = await montarCenario()
  const antes = new Set((await db.select().from(perfisPermissoes)).map((v) => `${v.perfilId}:${v.permissaoId}`))
  for (const comando of MIGRATION_0066.split('--> statement-breakpoint').map((t) => t.trim()).filter((t) => t.startsWith('INSERT INTO'))) {
    await db.execute(sql.raw(comando))
  }
  vinculosCriados = (await db.select().from(perfisPermissoes)).filter((v) => !antes.has(`${v.perfilId}:${v.permissaoId}`))
  await db
    .update(clientes)
    .set({ identificacaoFiscal: CNPJ_EMITENTE, tipoIdentificacaoFiscal: 'cnpj' })
    .where(eq(clientes.id, cenario.clienteA))
})

afterAll(async () => {
  sairDaSessao()
  await limparFiscal()
  if (cenario) {
    await db.update(clientes).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(clientes.id, cenario.clienteA))
  }
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('revisão em lote', () => {
  it('revisa os elegíveis e devolve o resultado de cada um', async () => {
    const primeiro = await aceito(nfe({ emissao: '2026-07-01' }), cenario.clienteA)
    const segundo = await aceito(nfe({ emissao: '2026-07-02' }), cenario.clienteA)
    const jaRevisado = await aceito(nfe({ emissao: '2026-07-03' }), cenario.clienteA)
    const naoInterpretado = await importar(nfeNaoInterpretada(), cenario.clienteA)
    if (naoInterpretado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    entrarComo(cenario.tokens.proprietario)
    await marcarDocumentoFiscalRevisado(jaRevisado)

    const resultado = await revisarDocumentosFiscaisEmLote([
      primeiro,
      segundo,
      jaRevisado,
      naoInterpretado.documentoId,
    ])
    expect(resultado).toMatchObject({
      sucesso: true,
      resumo: { selecionados: 4, revisados: 2, jaRevisados: 1, naoElegiveis: 1 },
    })
    expect(resultado.mensagem).toContain('4 selecionados')

    expect((await statusDe(primeiro)).revisao).toBe('revisado')
    expect((await statusDe(segundo)).revisao).toBe('revisado')
    // Documento sem leitura continua pendente: revisar é conferir a leitura.
    expect((await statusDe(naoInterpretado.documentoId)).revisao).toBe('pendente')
    expect((await statusDe(primeiro)).revisadoPorId).toBe(cenario.ids.proprietario)
  })

  it('a seleção que chega do navegador não vale como permissão', async () => {
    const doAlfa = await aceito(nfe({ emissao: '2026-07-04' }), cenario.clienteB)
    const doGestor = await importar(nfe({ emissao: '2026-07-05' }), null, cenario.empresaGestorId, 'gestorProfissional')
    if (doGestor.codigo !== 'ACEITO') throw new Error('esperava aceito')

    // Proprietário do Alfa tentando incluir documento do escritório vizinho:
    // ele entra como não elegível, sem distinção de "não existe".
    entrarComo(cenario.tokens.proprietario)
    const misturado = await revisarDocumentosFiscaisEmLote([doAlfa, doGestor.documentoId, crypto.randomUUID()])
    expect(misturado.resumo).toEqual({ selecionados: 3, revisados: 1, jaRevisados: 0, naoElegiveis: 2 })
    expect((await statusDe(doGestor.documentoId)).revisao).toBe('pendente')

    // Colaborador não tem `revisar`: nada muda.
    const outro = await aceito(nfe({ emissao: '2026-07-06' }), cenario.clienteA)
    entrarComo(cenario.tokens.colaboradorMembro)
    const semPermissao = await revisarDocumentosFiscaisEmLote([outro])
    expect(semPermissao).toMatchObject({ sucesso: false, resumo: { revisados: 0, naoElegiveis: 1 } })
    expect((await statusDe(outro)).revisao).toBe('pendente')

    // Membro comum não alcança documento de cliente que não é dele.
    entrarComo(cenario.tokens.profissionalMembro)
    expect(await revisarDocumentosFiscaisEmLote([doAlfa])).toMatchObject({
      resumo: { revisados: 0, naoElegiveis: 1 },
    })

    sairDaSessao()
    expect(await revisarDocumentosFiscaisEmLote([outro])).toMatchObject({ sucesso: false })
  })

  it('a entrada é validada e limitada', async () => {
    entrarComo(cenario.tokens.proprietario)
    expect(await revisarDocumentosFiscaisEmLote([])).toMatchObject({ sucesso: false })
    expect(await revisarDocumentosFiscaisEmLote(['não-é-uuid'])).toMatchObject({ sucesso: false })
    const demais = Array.from({ length: LIMITE_REVISAO_EM_LOTE + 1 }, () => crypto.randomUUID())
    expect(await revisarDocumentosFiscaisEmLote(demais)).toMatchObject({ sucesso: false })
  })

  it('cada documento revisado em lote deixa a sua auditoria', async () => {
    const a = await aceito(nfe({ emissao: '2026-07-07' }), cenario.clienteA)
    const b = await aceito(nfe({ emissao: '2026-07-08' }), cenario.clienteA)
    entrarComo(cenario.tokens.proprietario)
    await revisarDocumentosFiscaisEmLote([a, b])

    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.acao, 'documento_fiscal_revisado'), inArray(eventosAuditoria.registroAfetado, [a, b])))
    expect(eventos).toHaveLength(2)
    expect(eventos.every((evento) => evento.autorId === cenario.ids.proprietario)).toBe(true)
    expect(JSON.stringify(eventos.map((e) => e.metadados))).not.toContain('Café')
  })
})

describe('reprocessamento em lote', () => {
  it('reaproveita o domínio existente e resume o que aconteceu', async () => {
    const interpretado = await aceito(nfe({ emissao: '2026-07-09' }), cenario.clienteA)
    const semLeitura = await importar(nfeNaoInterpretada(), cenario.clienteA)
    if (semLeitura.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    entrarComo(cenario.tokens.proprietario)
    const resultado = await reprocessarDocumentosFiscaisEmLote([interpretado, semLeitura.documentoId])
    expect(resultado.resumo).toEqual({
      selecionados: 2,
      reprocessados: 1,
      naoInterpretados: 1,
      naoElegiveis: 0,
    })

    // Uma leitura nova para cada documento — e nenhuma duplicação de documento.
    const extracoes = await db
      .select({ id: documentosFiscaisExtracoes.id, documentoFiscalId: documentosFiscaisExtracoes.documentoFiscalId })
      .from(documentosFiscaisExtracoes)
      .where(inArray(documentosFiscaisExtracoes.documentoFiscalId, [interpretado, semLeitura.documentoId]))
    expect(extracoes).toHaveLength(4)
    const documentos = await db
      .select({ id: documentosFiscais.id })
      .from(documentosFiscais)
      .where(inArray(documentosFiscais.id, [interpretado, semLeitura.documentoId]))
    expect(documentos).toHaveLength(2)
  })

  it('respeita escopo e limite conservador', async () => {
    const doGestor = await importar(nfe({ emissao: '2026-07-10' }), null, cenario.empresaGestorId, 'gestorProfissional')
    if (doGestor.codigo !== 'ACEITO') throw new Error('esperava aceito')

    entrarComo(cenario.tokens.proprietario)
    expect(await reprocessarDocumentosFiscaisEmLote([doGestor.documentoId])).toMatchObject({
      sucesso: false,
      resumo: { reprocessados: 0, naoElegiveis: 1 },
    })

    const demais = Array.from({ length: LIMITE_REPROCESSAMENTO_EM_LOTE + 1 }, () => crypto.randomUUID())
    expect(await reprocessarDocumentosFiscaisEmLote(demais)).toMatchObject({ sucesso: false })
    expect(LIMITE_REPROCESSAMENTO_EM_LOTE).toBeLessThan(LIMITE_REVISAO_EM_LOTE)
  })
})

describe('ordenação, pendências e contexto', () => {
  it('ordena no banco, com desempate determinístico', async () => {
    const acesso = await acessoDe('proprietario')
    const porEmissao = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, ordem: 'emissao_asc' })
    const datas = porEmissao.documentos.map((d) => d.dataEmissao).filter((d): d is string => d !== null)
    expect([...datas].sort((a, b) => a.localeCompare(b))).toEqual(datas)

    const porValor = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, ordem: 'valor_desc' })
    const valores = porValor.documentos.map((d) => (d.valorTotal ? Number(d.valorTotal) : null)).filter((v): v is number => v !== null)
    expect([...valores].sort((a, b) => b - a)).toEqual(valores)

    // Duas leituras da mesma página devolvem exatamente a mesma ordem.
    const primeira = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, ordem: 'importacao_desc' })
    const segunda = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, ordem: 'importacao_desc' })
    expect(primeira.documentos.map((d) => d.id)).toEqual(segunda.documentos.map((d) => d.id))
    expect(ORDENS_DOCUMENTOS_FISCAIS[0]).toBe('emissao_desc')
  })

  it('o recorte "precisa de atenção" usa só estados que já existem', async () => {
    const acesso = await acessoDe('proprietario')
    const atencao = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, atencao: true })
    expect(atencao.documentos.length).toBeGreaterThan(0)
    expect(atencao.documentos.every((documento) => precisaDeAtencao(documento))).toBe(true)

    // Um documento processado, com sentido e já revisado sai do recorte.
    const tranquilo = await aceito(nfe({ emissao: '2026-07-11' }), cenario.clienteA)
    entrarComo(cenario.tokens.proprietario)
    await marcarDocumentoFiscalRevisado(tranquilo)
    const depois = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, atencao: true })
    expect(depois.documentos.map((d) => d.id)).not.toContain(tranquilo)

    const completa = await listarDocumentosFiscais(acesso, FILTROS_VAZIOS)
    expect(completa.documentos.map((d) => d.id)).toContain(tranquilo)
    expect(completa.resumo.pendentesRevisao).toBeGreaterThan(0)
    expect(completa.resumo.pendentesRevisao).toBeLessThanOrEqual(completa.resumo.total)
  })

  it('o resumo continua colado nos filtros e no escopo', async () => {
    const acesso = await acessoDe('proprietario')
    const revisados = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, revisao: 'revisado' })
    expect(revisados.documentos.every((d) => d.statusRevisao === 'revisado')).toBe(true)
    expect(revisados.resumo.pendentesRevisao).toBe(0)
    expect(revisados.resumo.total).toBe(revisados.documentos.length)

    const doMembro = await listar('profissionalMembro', { atencao: true })
    expect(doMembro.documentos.every((d) => d.clienteId === cenario.clienteA)).toBe(true)
  })

  it('a URL preserva ordem, recorte e página ao voltar do detalhe', () => {
    const filtros = lerFiltrosDocumentosFiscais({
      pagina: '2',
      ordem: 'valor_desc',
      atencao: '1',
      revisao: 'pendente',
      ordemInventada: 'x',
    })
    expect(filtros).toMatchObject({ pagina: 2, ordem: 'valor_desc', atencao: true, revisao: 'pendente' })

    const busca = montarBuscaDocumentosFiscais(filtros)
    expect(busca).toContain('ordem=valor_desc')
    expect(busca).toContain('atencao=1')
    expect(busca).toContain('pagina=2')
    // Ida e volta pela URL devolve exatamente os mesmos filtros.
    expect(lerFiltrosDocumentosFiscais(Object.fromEntries(new URLSearchParams(busca.slice(1))))).toEqual(filtros)

    expect(montarBuscaDocumentosFiscais({ ...filtros, atencao: false, ordem: null, pagina: 1 })).toBe(
      '?revisao=pendente',
    )
  })
})
