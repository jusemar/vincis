import { randomUUID } from 'node:crypto'
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
  documentosFiscaisItens,
  documentosFiscaisPartes,
  documentosFiscaisTributos,
  eventosAuditoria,
  perfisPermissoes,
} from '@/db/schema'
import { PARSER_FISCAL } from '@/features/documentos-fiscais/constants/nfe'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

/*
  Fase 1.5 — reprocessamento a partir do mesmo original.

  O armazenamento é simulado; autorização, barreira, parser, transação e
  histórico de extrações são reais.
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
const { reprocessarDocumentoFiscal } = await import('@/features/documentos-fiscais/lib/reprocessar-documento-fiscal')
const { calcularSha256 } = await import('@/features/documentos-fiscais/lib/validar-xml-fiscal')
const { normalizarIdentificacaoFiscal } = await import('@/features/documentos-fiscais/lib/identidade-fiscal')

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'
const CNPJ_EMITENTE = '12345678000195'

const lerFixture = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8')

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

function nfeCompleta() {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  return lerFixture('nfe-proc-completa.xml').replaceAll(CHAVE_FIXTURE, chave)
}

const arquivo = (conteudo: string, nome = `nfe-${sequencia}.xml`) =>
  new File([conteudo], nome, { type: 'application/xml' })

async function importar(xml: string, clienteId: string | null = cenario.clienteA) {
  const resultado = await receberXmlsFiscais({
    usuarioId: cenario.ids.proprietario,
    empresaId: cenario.empresaId,
    clienteId,
    arquivos: [arquivo(xml)],
  })
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
}

const documentoDe = async (id: string) => (await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, id)))[0]

const extracoesDe = async (documentoId: string) =>
  db
    .select()
    .from(documentosFiscaisExtracoes)
    .where(eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId))
    .orderBy(documentosFiscaisExtracoes.createdAt)

const arquivosDe = async (documentoId: string) =>
  db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, documentoId))

const contarDaExtracao = async (extracaoId: string) => ({
  itens: (await db.select({ id: documentosFiscaisItens.id }).from(documentosFiscaisItens).where(eq(documentosFiscaisItens.extracaoId, extracaoId))).length,
  partes: (await db.select({ id: documentosFiscaisPartes.id }).from(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, extracaoId))).length,
  tributos: (await db.select({ id: documentosFiscaisTributos.id }).from(documentosFiscaisTributos).where(eq(documentosFiscaisTributos.extracaoId, extracaoId))).length,
})

async function limparFiscal() {
  if (!cenario) return
  const empresasDoCenario = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresasDoCenario))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscais).where(inArray(documentosFiscais.id, ids))
  }
  await db.delete(eventosAuditoria).where(and(like(eventosAuditoria.acao, 'documento_fiscal_%'), inArray(eventosAuditoria.empresaId, empresasDoCenario)))
  armazenamento.objetos.clear()
}

beforeAll(async () => {
  cenario = await montarCenario()
  const antes = new Set((await db.select().from(perfisPermissoes)).map((v) => `${v.perfilId}:${v.permissaoId}`))
  for (const comando of MIGRATION_0066.split('--> statement-breakpoint').map((t) => t.trim()).filter((t) => t.startsWith('INSERT INTO'))) {
    await db.execute(sql.raw(comando))
  }
  vinculosCriados = (await db.select().from(perfisPermissoes)).filter((v) => !antes.has(`${v.perfilId}:${v.permissaoId}`))
})

afterAll(async () => {
  await limparFiscal()
  if (cenario) {
    await db.update(clientes).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(clientes.id, cenario.clienteA))
  }
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('reprocessar documento que o parser não interpretou', () => {
  it('a falha antiga continua registrada e uma nova extração é criada', async () => {
    const importado = await importar(lerFixture('nfe-versao-nao-suportada.xml'))
    if (importado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')
    const [arquivoOriginal] = await arquivosDe(importado.documentoId)
    const bytesAntes = armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!

    const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId: importado.documentoId })
    expect(resultado).toMatchObject({ sucesso: false, codigo: 'NAO_INTERPRETADO', motivo: 'LAYOUT_NAO_SUPORTADO' })

    const extracoes = await extracoesDe(importado.documentoId)
    expect(extracoes).toHaveLength(2)
    expect(extracoes.every((e) => e.status === 'falhou' && !e.vigente)).toBe(true)
    // A primeira leitura continua lá, com o erro que registrou.
    expect(extracoes[0].erros).toMatchObject({ codigo: 'LAYOUT_NAO_SUPORTADO', versaoEncontrada: '3.10' })
    expect(extracoes[1].id).not.toBe(extracoes[0].id)

    // Nem documento, nem arquivo, nem original mudaram.
    expect(await arquivosDe(importado.documentoId)).toHaveLength(1)
    expect((await documentoDe(importado.documentoId)).statusProcessamento).toBe('falhou')
    expect(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)).toEqual(bytesAntes)
  })

  it('quando a leitura passa a funcionar, o documento é preenchido e a extração vigente muda', async () => {
    await db
      .update(clientes)
      .set({ identificacaoFiscal: normalizarIdentificacaoFiscal(CNPJ_EMITENTE), tipoIdentificacaoFiscal: 'cnpj' })
      .where(eq(clientes.id, cenario.clienteA))

    const importado = await importar(nfeCompleta())
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    // Volta o documento ao estado de "parser antigo não conseguiu ler": a
    // estrutura fiscal nunca existiu e a leitura ficou registrada como falha.
    const [primeira] = await extracoesDe(importado.documentoId)
    await db.delete(documentosFiscaisTributos).where(eq(documentosFiscaisTributos.extracaoId, primeira.id))
    await db.delete(documentosFiscaisItens).where(eq(documentosFiscaisItens.extracaoId, primeira.id))
    await db.delete(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, primeira.id))
    await db
      .update(documentosFiscaisExtracoes)
      .set({ status: 'falhou', vigente: false, dados: null, erros: { codigo: 'LAYOUT_NAO_SUPORTADO', caminho: 'infNFe@versao', versaoEncontrada: '4.00' } })
      .where(eq(documentosFiscaisExtracoes.id, primeira.id))
    await db
      .update(documentosFiscais)
      .set({ statusProcessamento: 'falhou', processadoEm: null, tipo: null, chaveAcesso: null, sentido: null, valorTotal: null, emitenteIdentificacao: null })
      .where(eq(documentosFiscais.id, importado.documentoId))
    await db.delete(documentosFiscaisEventos).where(eq(documentosFiscaisEventos.documentoFiscalId, importado.documentoId))

    const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId: importado.documentoId })
    expect(resultado).toMatchObject({ sucesso: true, codigo: 'REPROCESSADO', statusAnterior: 'falhou', sentido: 'emitido' })
    if (!resultado.sucesso) return

    const documento = await documentoDe(importado.documentoId)
    expect(documento).toMatchObject({
      statusProcessamento: 'processado',
      tipo: 'nfe',
      sentido: 'emitido',
      emitenteIdentificacao: CNPJ_EMITENTE,
      valorTotal: '376.01',
    })
    expect(documento.chaveAcesso).toMatch(/^[0-9A-Z]{44}$/)

    const extracoes = await extracoesDe(importado.documentoId)
    expect(extracoes).toHaveLength(2)
    expect(extracoes[0]).toMatchObject({ id: primeira.id, status: 'falhou', vigente: false })
    const vigente = extracoes.find((e) => e.vigente)!
    expect(vigente).toMatchObject({ id: resultado.extracaoId, status: 'concluida', metodo: 'parser_xml', versao: PARSER_FISCAL.versao })
    expect(await contarDaExtracao(vigente.id)).toEqual({ itens: 2, partes: 2, tributos: 20 })
    // Nenhuma estrutura ficou pendurada na leitura antiga.
    expect(await contarDaExtracao(primeira.id)).toEqual({ itens: 0, partes: 0, tributos: 0 })
    // Um documento, um original.
    expect(await arquivosDe(importado.documentoId)).toHaveLength(1)
  })
})

describe('reprocessar documento já interpretado', () => {
  it('não duplica estrutura, não duplica evento e atualiza o que mudou no cadastro', async () => {
    await db.update(clientes).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(clientes.id, cenario.clienteA))
    const xml = nfeCompleta()
    const importado = await importar(xml)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(importado.documentoId)).sentido).toBe('nao_determinado')
    const [arquivoOriginal] = await arquivosDe(importado.documentoId)
    const shaAntes = calcularSha256(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)

    // O contribuinte ganha identidade fiscal depois da importação.
    await db
      .update(clientes)
      .set({ identificacaoFiscal: CNPJ_EMITENTE, tipoIdentificacaoFiscal: 'cnpj' })
      .where(eq(clientes.id, cenario.clienteA))

    const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId: importado.documentoId })
    expect(resultado).toMatchObject({ sucesso: true, statusAnterior: 'processado', sentido: 'emitido' })
    if (!resultado.sucesso) return

    const documento = await documentoDe(importado.documentoId)
    expect(documento.sentido).toBe('emitido')

    const extracoes = await extracoesDe(importado.documentoId)
    expect(extracoes).toHaveLength(2)
    expect(extracoes.filter((e) => e.vigente).map((e) => e.id)).toEqual([resultado.extracaoId])
    // Cada leitura tem a sua estrutura: nada foi somado à anterior.
    expect(await contarDaExtracao(extracoes[0].id)).toEqual({ itens: 2, partes: 2, tributos: 20 })
    expect(await contarDaExtracao(resultado.extracaoId)).toEqual({ itens: 2, partes: 2, tributos: 20 })

    // O evento do protocolo é do documento: reler o mesmo XML não o duplica.
    const eventos = await db.select().from(documentosFiscaisEventos).where(eq(documentosFiscaisEventos.documentoFiscalId, importado.documentoId))
    expect(eventos).toHaveLength(1)

    // Um documento, um original, bytes idênticos.
    expect(await arquivosDe(importado.documentoId)).toHaveLength(1)
    expect(calcularSha256(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)).toBe(shaAntes)
    expect(new TextDecoder().decode(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)).toBe(xml)

    const auditoria = await db.select().from(eventosAuditoria).where(and(eq(eventosAuditoria.registroAfetado, importado.documentoId), eq(eventosAuditoria.acao, 'documento_fiscal_processado')))
    expect(auditoria).toHaveLength(2)
    const doReprocesso = auditoria.find((e) => (e.metadados as { extracaoId?: string }).extracaoId === resultado.extracaoId)
    expect(doReprocesso?.metadados).toMatchObject({ statusAnterior: 'processado', statusNovo: 'processado', versao: PARSER_FISCAL.versao })
    for (const proibido of ['Café', CNPJ_EMITENTE, '376.01', '<']) {
      expect(JSON.stringify(auditoria.map((e) => e.metadados))).not.toContain(proibido)
    }
  })
})

describe('falhas do reprocessamento', () => {
  it('leitura que colide com outra NF-e do mesmo contribuinte desfaz tudo', async () => {
    const xml = nfeCompleta()
    const original = await importar(xml)
    if (original.codigo !== 'ACEITO') throw new Error('esperava aceito')

    // Documento sem chave ainda, cujo original é o mesmo XML: ao ser lido, a
    // chave já pertence ao documento acima.
    const documentoId = randomUUID()
    const arquivoId = randomUUID()
    const chaveStorage = `documentos-fiscais/${cenario.empresaId}/${documentoId}/${arquivoId}.xml`
    const bytes = new TextEncoder().encode(xml)
    await db.insert(documentosFiscais).values({
      id: documentoId,
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteA,
      origem: 'envio_usuario',
      statusProcessamento: 'falhou',
    })
    await db.insert(documentosFiscaisArquivos).values({
      id: arquivoId,
      empresaId: cenario.empresaId,
      documentoFiscalId: documentoId,
      tipoArquivo: 'xml',
      nomeOriginal: 'colidente.xml',
      tipoMime: 'application/xml',
      tamanhoBytes: bytes.byteLength,
      chaveArmazenamento: chaveStorage,
      sha256: calcularSha256(bytes),
      enviadoPorId: cenario.ids.proprietario,
    })
    armazenamento.objetos.set(chaveStorage, bytes)

    const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId })
    expect(resultado).toMatchObject({ sucesso: false, codigo: 'DOCUMENTO_DUPLICADO' })
    // Rollback: nenhuma extração, nenhum dado normalizado, documento intocado.
    expect(await extracoesDe(documentoId)).toHaveLength(0)
    expect(await documentoDe(documentoId)).toMatchObject({ statusProcessamento: 'falhou', chaveAcesso: null })
  })

  it('original indisponível não cria extração nem muda o documento', async () => {
    const importado = await importar(nfeCompleta())
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const [arquivoOriginal] = await arquivosDe(importado.documentoId)
    const antes = await documentoDe(importado.documentoId)
    armazenamento.objetos.delete(arquivoOriginal.chaveArmazenamento)

    const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId: importado.documentoId })
    expect(resultado).toMatchObject({ sucesso: false, codigo: 'ARQUIVO_INDISPONIVEL' })
    expect(await extracoesDe(importado.documentoId)).toHaveLength(1)
    expect(await documentoDe(importado.documentoId)).toMatchObject({ statusProcessamento: antes.statusProcessamento, chaveAcesso: antes.chaveAcesso })
  })
})

describe('autorização do reprocessamento', () => {
  it('só quem tem revisar no escritório do documento reprocessa', async () => {
    const importado = await importar(nfeCompleta())
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const extracoesAntes = await extracoesDe(importado.documentoId)

    for (const persona of ['gestorProfissional', 'estranho', 'gestor', 'colaboradorExterno', 'colaboradorMembro'] as const) {
      const resultado = await reprocessarDocumentoFiscal({ usuarioId: cenario.ids[persona], documentoId: importado.documentoId })
      expect(resultado, persona).toMatchObject({ sucesso: false, codigo: 'SEM_PERMISSAO' })
    }
    // Documento inexistente responde igual, sem revelar nada.
    expect(await reprocessarDocumentoFiscal({ usuarioId: cenario.ids.proprietario, documentoId: randomUUID() })).toMatchObject({
      sucesso: false,
      codigo: 'SEM_PERMISSAO',
    })
    expect(await extracoesDe(importado.documentoId)).toHaveLength(extracoesAntes.length)
  })
})
