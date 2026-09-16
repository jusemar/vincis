import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
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
  Fase 1.4 — integração parser + persistência transacional.

  `upload → barreira → parser → banco`, com o armazenamento privado simulado
  (mesma política do Vercel Blob: sem sobrescrita). Autorização, transação,
  índices de duplicidade e auditoria são reais. XMLs sintéticos.
*/

const armazenamento = vi.hoisted(() => ({
  objetos: new Map<string, Uint8Array>(),
  aoGravar: null as null | ((chave: string) => Promise<void>),
}))

vi.mock('@/features/documentos-fiscais/lib/armazenamento-fiscal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/documentos-fiscais/lib/armazenamento-fiscal')>()
  return {
    montarChaveOriginal: original.montarChaveOriginal,
    gravarOriginalPrivado: async (chave: string, bytes: Uint8Array) => {
      if (armazenamento.objetos.has(chave)) throw new Error('sobrescrita recusada')
      if (armazenamento.aoGravar) await armazenamento.aoGravar(chave)
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
const { calcularSha256 } = await import('@/features/documentos-fiscais/lib/validar-xml-fiscal')

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'

const lerFixture = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8')

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

/** A fixture completa, com chave de acesso nova a cada chamada. */
function nfeCompleta(ajustar: (xml: string) => string = (xml) => xml) {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  return ajustar(lerFixture('nfe-proc-completa.xml').replaceAll(CHAVE_FIXTURE, chave))
}

const arquivo = (conteudo: string, nome = `nfe-${sequencia}.xml`) =>
  new File([conteudo], nome, { type: 'application/xml' })

const enviar = (
  arquivos: File[],
  clienteId: string | null = cenario.clienteA,
  empresaId = cenario.empresaId,
  persona: keyof Cenario['ids'] = 'proprietario',
) =>
  receberXmlsFiscais({ usuarioId: cenario.ids[persona], empresaId, clienteId, arquivos })

async function importar(xml: string, clienteId: string | null = cenario.clienteA, empresaId = cenario.empresaId) {
  const resultado = await enviar([arquivo(xml)], clienteId, empresaId)
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
}

async function aceito(xml: string, clienteId: string | null = cenario.clienteA) {
  const item = await importar(xml, clienteId)
  if (item.codigo !== 'ACEITO') throw new Error(`esperava ACEITO, veio ${item.codigo}`)
  return item
}

const extracaoDe = async (documentoId: string) =>
  db.select().from(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId))

const itensDe = async (extracaoId: string) =>
  db
    .select()
    .from(documentosFiscaisItens)
    .where(eq(documentosFiscaisItens.extracaoId, extracaoId))
    .orderBy(documentosFiscaisItens.numeroItem)

const partesDe = async (extracaoId: string) =>
  db.select().from(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, extracaoId))

const tributosDe = async (extracaoId: string) =>
  db.select().from(documentosFiscaisTributos).where(eq(documentosFiscaisTributos.extracaoId, extracaoId))

const eventosDe = async (documentoId: string) =>
  db.select().from(documentosFiscaisEventos).where(eq(documentosFiscaisEventos.documentoFiscalId, documentoId))

/** Quantas linhas fiscais existem ao todo nas empresas do cenário. */
async function contagens() {
  const empresas = [cenario.empresaId, cenario.empresaGestorId]
  const documentos = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresas))
  const ids = documentos.map(({ id }) => id)
  const extracoes = ids.length
    ? await db.select({ id: documentosFiscaisExtracoes.id }).from(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    : []
  const extracaoIds = extracoes.map(({ id }) => id)
  const contar = async (tabela: typeof documentosFiscaisItens | typeof documentosFiscaisPartes | typeof documentosFiscaisTributos) =>
    extracaoIds.length
      ? (await db.select({ id: tabela.id }).from(tabela).where(inArray(tabela.extracaoId, extracaoIds))).length
      : 0
  return {
    documentos: ids.length,
    extracoes: extracoes.length,
    itens: await contar(documentosFiscaisItens),
    partes: await contar(documentosFiscaisPartes),
    tributos: await contar(documentosFiscaisTributos),
    eventos: ids.length ? (await db.select({ id: documentosFiscaisEventos.id }).from(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))).length : 0,
    arquivos: ids.length ? (await db.select({ id: documentosFiscaisArquivos.id }).from(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))).length : 0,
    objetos: armazenamento.objetos.size,
  }
}

async function limparFiscal() {
  if (!cenario) return
  const empresas = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresas))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
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
})

beforeEach(() => {
  armazenamento.aoGravar = null
})

afterAll(async () => {
  await limparFiscal()
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('importação completa de uma NF-e', () => {
  it('grava documento, arquivo, extração, partes, itens, tributos e evento do protocolo', async () => {
    const xml = nfeCompleta()
    const item = await aceito(xml)

    const [documento] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, item.documentoId))
    expect(documento).toMatchObject({
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteA,
      enviadoPorId: cenario.ids.proprietario,
      origem: 'envio_usuario',
      tipo: 'nfe',
      statusProcessamento: 'processado',
      statusRevisao: 'pendente',
      // Sem consulta à SEFAZ, a situação continua não verificada.
      situacao: 'nao_verificada',
      modelo: '55',
      serie: '1',
      numero: '1',
      versaoLeiaute: '4.00',
      dataEmissao: '2026-09-15',
      emitenteIdentificacao: '12345678000195',
      emitenteNome: 'Comércio Sintético & Cia Ltda',
      destinatarioIdentificacao: '98765432000198',
      destinatarioNome: 'Distribuidora Fictícia S.A.',
      valorTotal: '376.01',
      valorProdutos: '355.00',
      valorFrete: '10.00',
      valorSeguro: '2.00',
      valorDesconto: '5.00',
      valorOutrasDespesas: '1.00',
      sha256Original: calcularSha256(new TextEncoder().encode(xml)),
    })
    expect(documento.chaveAcesso).toMatch(/^[0-9A-Z]{44}$/)
    expect(documento.processadoEm).toBeInstanceOf(Date)
    expect(documento.emitidoEm).toBeInstanceOf(Date)

    const [arquivoGravado] = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, documento.id))
    expect(arquivoGravado).toMatchObject({
      empresaId: cenario.empresaId,
      tipoArquivo: 'xml',
      tipoMime: 'application/xml',
      tamanhoBytes: new TextEncoder().encode(xml).byteLength,
      sha256: documento.sha256Original,
    })
    expect(arquivoGravado.chaveArmazenamento).toBe(`documentos-fiscais/${cenario.empresaId}/${documento.id}/${arquivoGravado.id}.xml`)
    expect(arquivoGravado.chaveArmazenamento).not.toMatch(/^https?:/)

    const [extracao] = await extracaoDe(documento.id)
    expect(extracao).toMatchObject({
      arquivoId: arquivoGravado.id,
      metodo: 'parser_xml',
      provedor: PARSER_FISCAL.provedor,
      versao: PARSER_FISCAL.versao,
      status: 'concluida',
      vigente: true,
      erros: null,
    })
    // Proveniência, não cópia do XML.
    expect(extracao.dados).toEqual({ raiz: 'nfeProc', versaoLeiaute: '4.00', tipo: 'nfe', itens: 2, tributos: 20, partes: 2, protocolo: true })
    expect(JSON.stringify(extracao.dados)).not.toContain('<')

    const partes = await partesDe(extracao.id)
    expect(partes.map((p) => p.papel).sort()).toEqual(['destinatario', 'emitente'])
    expect(partes.find((p) => p.papel === 'emitente')).toMatchObject({
      tipoIdentificacao: 'cnpj',
      identificacao: '12345678000195',
      nome: 'Comércio Sintético & Cia Ltda',
      nomeFantasia: 'Sintético',
      inscricaoEstadual: '111111111111',
      regimeTributario: '3',
      logradouro: 'Rua das Provas',
      numero: '100',
      complemento: 'Sala 2',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01001000',
      pais: 'BRASIL',
      dadosEspecificos: { IEST: '222222222222' },
    })
    expect(partes.find((p) => p.papel === 'destinatario')).toMatchObject({
      identificacao: '98765432000198',
      uf: 'RJ',
      email: 'contato@exemplo.invalid',
    })

    const itens = await itensDe(extracao.id)
    expect(itens).toHaveLength(2)
    expect(itens[0]).toMatchObject({
      numeroItem: 1,
      codigoProduto: 'PROD-001',
      descricao: 'Café torrado 500g',
      gtin: '7891234567895',
      ncm: '09012100',
      cest: '1700100',
      cfop: '5102',
      unidade: 'CX',
      quantidade: '10.0000',
      valorUnitario: '25.5000000000',
      valorBruto: '255.00',
      valorDesconto: '5.00',
      valorFrete: '10.00',
      valorSeguro: '2.00',
      valorOutrasDespesas: '1.00',
      // O que não tem coluna própria não se perde.
      dadosEspecificos: { xPed: 'PEDIDO-9', infAdProd: 'Lote de teste', uTrib: 'CX', indTot: '1' },
    })
    expect(itens[1]).toMatchObject({ numeroItem: 2, gtin: 'SEM GTIN', dadosEspecificos: { indTot: '0' } })

    const tributos = await tributosDe(extracao.id)
    // O resumo da extração conta exatamente o que foi gravado.
    expect(tributos).toHaveLength(20)
    const doItem1 = tributos.filter((t) => t.itemId === itens[0].id)
    expect(doItem1.map((t) => t.tributo).sort()).toEqual(['cofins', 'fcp', 'icms', 'ipi', 'pis'])
    expect(doItem1.find((t) => t.tributo === 'icms')).toMatchObject({
      codigoSituacao: '00',
      baseCalculo: '263.00',
      aliquotaPercentual: '18.0000',
      valor: '47.34',
      retido: false,
      dadosEspecificos: { grupo: 'ICMS00', orig: '0', modBC: '3' },
    })
    const doDocumento = tributos.filter((t) => t.itemId === null)
    expect(doDocumento.find((t) => t.tributo === 'icms')).toMatchObject({ baseCalculo: '263.00', valor: '47.34' })
    expect(doDocumento.find((t) => t.tributo === 'csll')).toMatchObject({ valor: '3.00', retido: true })
    expect(doDocumento.find((t) => t.tributo === 'irrf')).toMatchObject({ baseCalculo: '255.00', retido: true })

    // Protocolo é evento do documento — o que o XML declarou, sem consulta externa.
    const eventos = await eventosDe(documento.id)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      tipo: 'autorizacao',
      protocolo: '135260000000001',
      origem: 'envio_usuario',
      registradoPorId: cenario.ids.proprietario,
      dadosEspecificos: { codigoStatus: '100', motivo: 'Autorizado o uso da NF-e', ambiente: 'producao' },
    })
    expect(eventos[0].ocorridoEm).toBeInstanceOf(Date)
  })

  it('a auditoria registra envio e processamento, sem conteúdo fiscal', async () => {
    const item = await aceito(nfeCompleta())
    const eventos = await db.select().from(eventosAuditoria).where(eq(eventosAuditoria.registroAfetado, item.documentoId))
    const acoes = eventos.map((e) => e.acao).sort()
    expect(acoes).toEqual(['documento_fiscal_enviado', 'documento_fiscal_processado'])

    const [extracao] = await extracaoDe(item.documentoId)
    const processado = eventos.find((e) => e.acao === 'documento_fiscal_processado')
    expect(processado).toMatchObject({ entidade: 'documento_fiscal_extracao', empresaId: cenario.empresaId, autorId: cenario.ids.proprietario })
    expect(processado?.metadados).toEqual({
      tipoDocumento: 'nfe',
      metodoExtracao: 'parser_xml',
      provedor: PARSER_FISCAL.provedor,
      versao: PARSER_FISCAL.versao,
      extracaoId: extracao.id,
      clienteId: cenario.clienteA,
      statusAnterior: 'pendente',
      statusNovo: 'processado',
    })
    const serializado = JSON.stringify(eventos.map((e) => e.metadados))
    for (const proibido of ['12345678000195', 'Café', 'PROD-001', '376.01', CHAVE_FIXTURE.slice(0, 20), '<']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  it('o original permanece intocado e nenhum valor decimal passa por number', async () => {
    const xml = nfeCompleta()
    const item = await aceito(xml)
    const [arquivoGravado] = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, item.documentoId))
    const guardado = armazenamento.objetos.get(arquivoGravado.chaveArmazenamento)!
    expect(new TextDecoder().decode(guardado)).toBe(xml)
    expect(calcularSha256(guardado)).toBe(arquivoGravado.sha256)

    const [extracao] = await extracaoDe(item.documentoId)
    const itens = await itensDe(extracao.id)
    // Texto de ponta a ponta: o valor unitário de 10 casas chegaria diferente
    // se tivesse passado por `number`.
    expect(itens[0].valorUnitario).toBe('25.5000000000')
    expect(String(Number('25.5000000000'))).not.toBe('25.5000000000')
    for (const valor of [itens[0].quantidade, itens[0].valorBruto, itens[0].valorUnitario]) {
      expect(typeof valor).toBe('string')
    }
    const [documento] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, item.documentoId))
    expect(typeof documento.valorTotal).toBe('string')
  })
})

describe('atomicidade', () => {
  it('falha ao gravar um item não deixa documento, arquivo, extração ou objeto para trás', async () => {
    const antes = await contagens()
    // `codigo_produto` tem 60 caracteres no banco: o item quebra a transação
    // depois de documento, arquivo e extração já terem sido inseridos.
    const xml = nfeCompleta((original) => original.replace('<cProd>PROD-001</cProd>', `<cProd>${'P'.repeat(120)}</cProd>`))
    const item = await importar(xml)
    expect(item.codigo).toBe('FALHA_REGISTRO')
    expect(await contagens()).toEqual(antes)
  })

  it('falha ao gravar um tributo também desfaz tudo', async () => {
    const antes = await contagens()
    // Grupo tributário com nome longo demais para `tributo` (30 caracteres).
    const xml = nfeCompleta((original) =>
      original.replace(
        '<vTotTrib>40.00</vTotTrib>',
        '<GrupoTributarioMuitoLongoParaCaberNaColuna><vBC>1.00</vBC><vTrib>1.00</vTrib></GrupoTributarioMuitoLongoParaCaberNaColuna>',
      ),
    )
    const item = await importar(xml)
    expect(item.codigo).toBe('FALHA_REGISTRO')
    expect(await contagens()).toEqual(antes)
  })

  it('falha do banco depois do storage não deixa objeto órfão nem documento fantasma', async () => {
    const antes = await contagens()
    armazenamento.aoGravar = async (chave) => {
      // Alguém ocupa o id do documento entre a gravação e a transação.
      const documentoId = chave.split('/')[2]
      await db.insert(documentosFiscais).values({ id: documentoId, empresaId: cenario.empresaId, origem: 'envio_usuario' })
    }
    const item = await importar(nfeCompleta())
    expect(item.codigo).toBe('FALHA_REGISTRO')
    // O documento plantado é o único que sobra; nada derivado foi gravado.
    const depois = await contagens()
    expect(depois).toMatchObject({ ...antes, documentos: antes.documentos + 1 })
  })
})

describe('duplicidade e idempotência', () => {
  it('reenviar o mesmo XML não cria documento, item, tributo nem parte novos', async () => {
    const xml = nfeCompleta()
    const primeiro = await aceito(xml)
    const depoisDoPrimeiro = await contagens()

    const segundo = await importar(xml)
    expect(segundo).toMatchObject({ codigo: 'DOCUMENTO_DUPLICADO', documentoId: primeiro.documentoId })
    expect(await contagens()).toEqual(depoisDoPrimeiro)
  })

  it('a mesma NF-e em arquivo diferente também é reconhecida pela chave de acesso', async () => {
    const xml = nfeCompleta()
    const primeiro = await aceito(xml)
    const depoisDoPrimeiro = await contagens()

    // Mesmo documento fiscal, bytes diferentes: o SHA-256 muda, a chave não.
    const outroArquivo = `${xml}\n`
    expect(calcularSha256(new TextEncoder().encode(outroArquivo))).not.toBe(calcularSha256(new TextEncoder().encode(xml)))
    const segundo = await importar(outroArquivo)
    expect(segundo).toMatchObject({ codigo: 'DOCUMENTO_DUPLICADO', documentoId: primeiro.documentoId })
    expect(await contagens()).toEqual(depoisDoPrimeiro)
  })

  it('a mesma NF-e para outro cliente é outro documento, com os seus próprios derivados', async () => {
    const xml = nfeCompleta()
    const doA = await aceito(xml, cenario.clienteA)
    const doB = await aceito(xml, cenario.clienteB)
    expect(doB.documentoId).not.toBe(doA.documentoId)

    const [extracaoA] = await extracaoDe(doA.documentoId)
    const [extracaoB] = await extracaoDe(doB.documentoId)
    expect((await itensDe(extracaoA.id)).map((i) => i.numeroItem)).toEqual([1, 2])
    expect((await itensDe(extracaoB.id)).map((i) => i.numeroItem)).toEqual([1, 2])
    expect(extracaoA.id).not.toBe(extracaoB.id)
  })
})

describe('lote com resultados independentes', () => {
  it('válido, duplicado, não interpretado e recusado convivem no mesmo envio', async () => {
    const repetido = nfeCompleta()
    await aceito(repetido)

    const resultado = await enviar(
      [
        arquivo(nfeCompleta(), 'nova.xml'),
        arquivo(repetido, 'repetida.xml'),
        arquivo(lerFixture('nfe-versao-nao-suportada.xml'), 'antiga.xml'),
        arquivo('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>', 'quebrada.xml'),
      ],
      cenario.clienteA,
    )
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.arquivos.map((r) => [r.nome, r.codigo])).toEqual([
      ['nova.xml', 'ACEITO'],
      ['repetida.xml', 'DOCUMENTO_DUPLICADO'],
      ['antiga.xml', 'DOCUMENTO_NAO_INTERPRETADO'],
      ['quebrada.xml', 'XML_INVALIDO'],
    ])
    expect(resultado.resumo).toEqual({ total: 4, aceitos: 1, duplicados: 1, naoInterpretados: 1, recusados: 1 })

    // O XML que o parser ainda não lê fica guardado para reprocessamento, sem
    // nenhum dado fiscal inventado.
    const naoInterpretado = resultado.arquivos[2]
    if (naoInterpretado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperado não interpretado')
    expect(naoInterpretado.motivo).toBe('LAYOUT_NAO_SUPORTADO')
    const [documento] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, naoInterpretado.documentoId))
    expect(documento).toMatchObject({ statusProcessamento: 'falhou', tipo: null, chaveAcesso: null, valorTotal: null, processadoEm: null })
    const [extracao] = await extracaoDe(documento.id)
    expect(extracao).toMatchObject({ status: 'falhou', vigente: false, dados: null })
    expect(extracao.erros).toEqual({ codigo: 'LAYOUT_NAO_SUPORTADO', caminho: 'infNFe@versao', versaoEncontrada: '3.10' })
    expect(await itensDe(extracao.id)).toHaveLength(0)
    expect(await partesDe(extracao.id)).toHaveLength(0)
    expect(await tributosDe(extracao.id)).toHaveLength(0)
    // O arquivo original continua guardado e ligado ao documento.
    const [arquivoGravado] = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, documento.id))
    expect(armazenamento.objetos.has(arquivoGravado.chaveArmazenamento)).toBe(true)
  })
})

describe('isolamento por empresa', () => {
  it('a empresa gravada é a autorizada pelo servidor, e o escritório vizinho não alcança nada', async () => {
    const xml = nfeCompleta()
    const doAlfa = await aceito(xml, cenario.clienteA)

    // Proprietário do Alfa pedindo o escritório do Gestor: recusado antes de gravar.
    expect(await enviar([arquivo(xml)], null, cenario.empresaGestorId)).toMatchObject({ sucesso: false, codigo: 'SEM_PERMISSAO' })

    // O mesmo XML no escritório do Gestor é outro documento, com derivados próprios.
    const doGestor = await receberXmlsFiscais({
      usuarioId: cenario.ids.gestorProfissional,
      empresaId: cenario.empresaGestorId,
      clienteId: null,
      arquivos: [arquivo(xml)],
    })
    if (!doGestor.sucesso || doGestor.arquivos[0].codigo !== 'ACEITO') throw new Error('esperava aceito no escritório do Gestor')

    const [alfa] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, doAlfa.documentoId))
    const [gestor] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, doGestor.arquivos[0].documentoId))
    expect(alfa.empresaId).toBe(cenario.empresaId)
    expect(gestor.empresaId).toBe(cenario.empresaGestorId)
    expect(gestor.id).not.toBe(alfa.id)

    // Cada derivado pertence à extração do seu próprio documento.
    const [extracaoAlfa] = await extracaoDe(alfa.id)
    const [extracaoGestor] = await extracaoDe(gestor.id)
    for (const [extracao, documentoId] of [[extracaoAlfa, alfa.id], [extracaoGestor, gestor.id]] as const) {
      expect(extracao.documentoFiscalId).toBe(documentoId)
      expect((await itensDe(extracao.id)).length).toBe(2)
      expect((await partesDe(extracao.id)).length).toBe(2)
    }
    const arquivosDoAlfa = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, alfa.id))
    expect(arquivosDoAlfa.every((a) => a.empresaId === cenario.empresaId)).toBe(true)
    expect(arquivosDoAlfa[0].chaveArmazenamento.startsWith(`documentos-fiscais/${cenario.empresaId}/`)).toBe(true)
  })

  it('membro sem acesso ao cliente não importa para ele', async () => {
    const resultado = await receberXmlsFiscais({
      usuarioId: cenario.ids.profissionalMembro,
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteB,
      arquivos: [arquivo(nfeCompleta())],
    })
    expect(resultado).toMatchObject({ sucesso: false, codigo: 'CLIENTE_FORA_DO_ESCOPO' })
  })
})
