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
  formatarChaveAcesso,
  formatarDataFiscal,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
  formatarValorUnitario,
} from '@/features/documentos-fiscais/lib/formatacao-fiscal'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'
import { entrarComo, sairDaSessao } from './setup/sessao'

/*
  Fase 1.8 — detalhe da NF-e, itens, tributos e revisão.

  Escopo, extração vigente, ações e auditoria rodam de verdade; só o
  armazenamento é simulado.
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
const { obterDocumentoFiscal } = await import('@/features/documentos-fiscais/queries/obter-documento-fiscal')
const { marcarDocumentoFiscalRevisado, reabrirRevisaoDocumentoFiscal } = await import(
  '@/features/documentos-fiscais/actions/revisar-documento'
)
const { reprocessarDocumentoFiscalAction } = await import('@/features/documentos-fiscais/actions/reprocessar-documento')

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

async function abrir(persona: keyof Cenario['ids'], documentoId: string) {
  return obterDocumentoFiscal(cenario.ids[persona], documentoId)
}

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

describe('detalhe do documento interpretado', () => {
  it('traz cabeçalho, partes, itens, tributos, protocolo e arquivo da extração vigente', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    const detalhe = await abrir('proprietario', importado.documentoId)
    if (!detalhe) throw new Error('esperava detalhe')

    expect(detalhe.documento).toMatchObject({
      tipo: 'nfe',
      numero: '1',
      serie: '1',
      dataEmissao: '2026-09-15',
      modelo: '55',
      versaoLeiaute: '4.00',
      sentido: 'emitido',
      statusProcessamento: 'processado',
      statusRevisao: 'pendente',
      situacao: 'nao_verificada',
      valorTotal: '376.01',
      valorProdutos: '355.00',
      clienteNome: 'Cliente A',
    })
    expect(detalhe.documento.chaveAcesso).toMatch(/^[0-9A-Z]{44}$/)

    expect(detalhe.emitente).toMatchObject({
      identificacao: CNPJ_EMITENTE,
      nome: 'Comércio Sintético & Cia Ltda',
      nomeFantasia: 'Sintético',
      inscricaoEstadual: '111111111111',
      municipio: 'São Paulo',
      uf: 'SP',
    })
    expect(detalhe.destinatario).toMatchObject({
      identificacao: '98765432000198',
      nome: 'Distribuidora Fictícia S.A.',
      uf: 'RJ',
    })

    expect(detalhe.itens).toHaveLength(2)
    expect(detalhe.itens.map((item) => item.numeroItem)).toEqual([1, 2])
    expect(detalhe.itens[0]).toMatchObject({
      codigoProduto: 'PROD-001',
      descricao: 'Café torrado 500g',
      ncm: '09012100',
      cest: '1700100',
      cfop: '5102',
      unidade: 'CX',
      quantidade: '10.0000',
      valorUnitario: '25.5000000000',
      valorBruto: '255.00',
      valorDesconto: '5.00',
    })

    // Tributos são do item, não uma lista global colada em cada linha.
    const doItem1 = detalhe.itens[0].tributos
    expect(doItem1.map((t) => t.tributo).sort()).toEqual(['cofins', 'fcp', 'icms', 'ipi', 'pis'])
    expect(doItem1.find((t) => t.tributo === 'icms')).toMatchObject({
      codigoSituacao: '00',
      baseCalculo: '263.00',
      aliquotaPercentual: '18.0000',
      valor: '47.34',
    })
    expect(detalhe.itens[1].tributos.every((t) => t.itemId === detalhe.itens[1].id)).toBe(true)
    expect(detalhe.tributosDoDocumento.every((t) => t.itemId === null)).toBe(true)
    expect(detalhe.tributosDoDocumento.find((t) => t.tributo === 'csll')).toMatchObject({ retido: true })

    // Protocolo é evento do arquivo; a situação fiscal não virou "autorizada".
    expect(detalhe.eventos).toHaveLength(1)
    expect(detalhe.eventos[0]).toMatchObject({ tipo: 'autorizacao', protocolo: '135260000000001' })
    expect(detalhe.documento.situacao).toBe('nao_verificada')

    expect(detalhe.arquivoOriginal?.nomeOriginal).toMatch(/\.xml$/)
    expect(JSON.stringify(detalhe)).not.toContain('documentos-fiscais/')
    expect(detalhe.permissoes).toEqual({ revisar: true, baixar: true })
  })

  it('valores decimais chegam como texto e são formatados sem perder precisão', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const detalhe = await abrir('proprietario', importado.documentoId)
    const item = detalhe!.itens[0]

    expect(typeof item.valorUnitario).toBe('string')
    // Zeros à direita não viram informação: 25,5 é R$ 25,50, e um unitário com
    // muitas casas mantém as que existem.
    expect(formatarValorUnitario(item.valorUnitario)).toBe('R$ 25,50')
    expect(formatarValorUnitario('12.3456789000')).toBe('R$ 12,345678')
    expect(formatarMoeda(detalhe!.documento.valorTotal)).toBe('R$ 376,01')
    expect(formatarMoeda('1234567.89')).toBe('R$ 1.234.567,89')
    expect(formatarQuantidade('10.0000')).toBe('10')
    expect(formatarPercentual('18.0000')).toBe('18%')
    expect(formatarDataFiscal('2026-09-15')).toBe('15/09/2026')
    expect(formatarChaveAcesso(detalhe!.documento.chaveAcesso)).toContain(' ')
    // Ausência não vira zero.
    expect(formatarMoeda(null)).toBe('—')
    expect(formatarMoeda('0.00')).toBe('R$ 0,00')
  })
})

describe('escopo do detalhe', () => {
  it('documento de outro escritório e fora do escopo do membro respondem igual: nada', async () => {
    const doAlfa = await importar(nfeCompleta(), cenario.clienteB)
    const doGestor = await importar(nfeCompleta(), null, cenario.empresaGestorId, 'gestorProfissional')
    if (doAlfa.codigo !== 'ACEITO' || doGestor.codigo !== 'ACEITO') throw new Error('esperava aceitos')

    expect(await abrir('gestorProfissional', doAlfa.documentoId)).toBeNull()
    expect(await abrir('estranho', doAlfa.documentoId)).toBeNull()
    expect(await abrir('proprietario', doGestor.documentoId)).toBeNull()
    // Membro comum não tem acesso ao Cliente B.
    expect(await abrir('profissionalMembro', doAlfa.documentoId)).toBeNull()
    expect(await abrir('proprietario', crypto.randomUUID())).toBeNull()

    // O mesmo membro abre o documento do cliente a que está atribuído.
    const doClienteA = await importar(nfeCompleta(), cenario.clienteA)
    if (doClienteA.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const visivel = await abrir('profissionalMembro', doClienteA.documentoId)
    expect(visivel?.documento.id).toBe(doClienteA.documentoId)
    // Sem `revisar` no perfil dele? O colaborador é quem não tem — aqui o que
    // importa é que as permissões vêm resolvidas do servidor.
    expect(visivel?.permissoes).toEqual({ revisar: true, baixar: true })
    const doColaborador = await abrir('colaboradorMembro', doClienteA.documentoId)
    expect(doColaborador?.permissoes).toEqual({ revisar: false, baixar: true })
  })
})

describe('documento não interpretado', () => {
  it('abre a tela com o arquivo e o erro registrado, sem itens nem tributos', async () => {
    const importado = await importar(nfeNaoInterpretada(), cenario.clienteA)
    if (importado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    const detalhe = await abrir('proprietario', importado.documentoId)
    expect(detalhe?.documento.statusProcessamento).toBe('falhou')
    expect(detalhe?.extracaoVigente).toBeNull()
    expect(detalhe?.itens).toEqual([])
    expect(detalhe?.tributosDoDocumento).toEqual([])
    expect(detalhe?.emitente).toBeNull()
    expect(detalhe?.arquivoOriginal?.nomeOriginal).toMatch(/\.xml$/)
    expect(detalhe?.historicoExtracoes[0]?.erros).toMatchObject({ codigo: 'LAYOUT_NAO_SUPORTADO' })
  })

  it('reprocessar pelo detalhe usa a mesma action e alimenta o histórico', async () => {
    const importado = await importar(nfeNaoInterpretada(), cenario.clienteA)
    if (importado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    entrarComo(cenario.tokens.proprietario)
    const resultado = await reprocessarDocumentoFiscalAction(importado.documentoId)
    expect(resultado).toMatchObject({ sucesso: false, codigo: 'NAO_INTERPRETADO' })

    const detalhe = await abrir('proprietario', importado.documentoId)
    expect(detalhe?.historicoExtracoes).toHaveLength(2)
    expect(detalhe?.historicoExtracoes.every((e) => e.status === 'falhou')).toBe(true)
    expect(detalhe?.historicoExtracoes.filter((e) => e.vigente)).toHaveLength(0)
  })

  it('o histórico mostra a leitura antiga e a vigente, sem misturar dados', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    entrarComo(cenario.tokens.proprietario)
    expect((await reprocessarDocumentoFiscalAction(importado.documentoId)).sucesso).toBe(true)

    const detalhe = await abrir('proprietario', importado.documentoId)
    expect(detalhe?.historicoExtracoes).toHaveLength(2)
    const vigentes = detalhe!.historicoExtracoes.filter((e) => e.vigente)
    expect(vigentes).toHaveLength(1)
    expect(detalhe?.extracaoVigente?.id).toBe(vigentes[0].id)
    // Os itens exibidos são os da leitura vigente — e só eles.
    expect(detalhe?.itens).toHaveLength(2)
    expect(detalhe?.itens.every((item) => item.extracaoId === detalhe!.extracaoVigente!.id)).toBe(true)
    expect(detalhe?.eventos).toHaveLength(1)
  })
})

describe('revisão do documento', () => {
  it('marca como revisado, registra quem e quando, e reabre', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    entrarComo(cenario.tokens.proprietario)
    const revisado = await marcarDocumentoFiscalRevisado(importado.documentoId)
    expect(revisado).toMatchObject({ sucesso: true, statusRevisao: 'revisado' })

    const depois = await abrir('proprietario', importado.documentoId)
    expect(depois?.documento.statusRevisao).toBe('revisado')
    expect(depois?.documento.revisadoEm).toBeInstanceOf(Date)
    expect(depois?.documento.revisadoPorNome).toBeTruthy()
    // Revisar não mexe em processamento nem em situação fiscal.
    expect(depois?.documento.statusProcessamento).toBe('processado')
    expect(depois?.documento.situacao).toBe('nao_verificada')

    // Repetir é idempotente.
    expect(await marcarDocumentoFiscalRevisado(importado.documentoId)).toMatchObject({
      sucesso: true,
      statusRevisao: 'revisado',
    })

    const reaberto = await reabrirRevisaoDocumentoFiscal(importado.documentoId)
    expect(reaberto).toMatchObject({ sucesso: true, statusRevisao: 'pendente' })
    const final = await abrir('proprietario', importado.documentoId)
    expect(final?.documento.statusRevisao).toBe('pendente')
    expect(final?.documento.revisadoEm).toBeNull()
  })

  it('registra auditoria mínima, sem conteúdo fiscal', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    entrarComo(cenario.tokens.proprietario)
    await marcarDocumentoFiscalRevisado(importado.documentoId)

    const eventos = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.registroAfetado, importado.documentoId), eq(eventosAuditoria.acao, 'documento_fiscal_revisado')))
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({
      entidade: 'documento_fiscal',
      autorId: cenario.ids.proprietario,
      empresaId: cenario.empresaId,
    })
    expect(eventos[0].metadados).toEqual({
      clienteId: cenario.clienteA,
      statusAnterior: 'pendente',
      statusNovo: 'revisado',
    })
    const serializado = JSON.stringify(eventos[0].metadados)
    for (const proibido of ['Café', CNPJ_EMITENTE, '376.01', '<']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  it('sem permissão de revisão, nada muda — inclusive em documento de outro escritório', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    for (const persona of ['colaboradorMembro', 'gestorProfissional', 'estranho', 'gestor'] as const) {
      entrarComo(cenario.tokens[persona])
      expect(await marcarDocumentoFiscalRevisado(importado.documentoId), persona).toMatchObject({
        sucesso: false,
        documentoId: null,
        statusRevisao: null,
      })
    }
    sairDaSessao()
    expect(await marcarDocumentoFiscalRevisado(importado.documentoId)).toMatchObject({ sucesso: false })

    const detalhe = await abrir('proprietario', importado.documentoId)
    expect(detalhe?.documento.statusRevisao).toBe('pendente')
    const auditoria = await db
      .select()
      .from(eventosAuditoria)
      .where(and(eq(eventosAuditoria.registroAfetado, importado.documentoId), eq(eventosAuditoria.acao, 'documento_fiscal_revisado')))
    expect(auditoria).toHaveLength(0)
  })

  it('documento não interpretado não pode ser marcado como revisado', async () => {
    const importado = await importar(nfeNaoInterpretada(), cenario.clienteA)
    if (importado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    entrarComo(cenario.tokens.proprietario)
    const resultado = await marcarDocumentoFiscalRevisado(importado.documentoId)
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('Reprocesse')
    expect((await abrir('proprietario', importado.documentoId))?.documento.statusRevisao).toBe('pendente')
  })
})
