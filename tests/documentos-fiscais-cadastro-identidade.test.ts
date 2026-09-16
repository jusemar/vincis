import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clienteAtribuicoes,
  clientes,
  colaboracoesCliente,
  documentosFiscais,
  documentosFiscaisArquivos,
  documentosFiscaisEventos,
  documentosFiscaisExtracoes,
  empresas,
  eventosAuditoria,
  perfisPermissoes,
} from '@/db/schema'
import { atualizarCliente, criarCliente, obterMeuCliente } from '@/features/clientes/actions/clientes'
import { atualizarIdentidadeFiscalEscritorio } from '@/features/empresas/actions/identidade-fiscal'
import { formatarIdentificacaoFiscal } from '@/features/documentos-fiscais/lib/identidade-fiscal'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'
import { entrarComo, sairDaSessao } from './setup/sessao'

/*
  Fase 1.6 — identidade fiscal nos cadastros existentes e entrada do
  reprocessamento.

  Cadastro, autorização, parser, transação e auditoria rodam de verdade; só o
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
const { reprocessarDocumentoFiscalAction } = await import('@/features/documentos-fiscais/actions/reprocessar-documento')
const { calcularSha256 } = await import('@/features/documentos-fiscais/lib/validar-xml-fiscal')

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'
const CNPJ_EMITENTE = '12345678000195'
const CNPJ_DESTINATARIO = '98765432000198'

const lerFixture = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8')

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

function nfeCompleta() {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  return lerFixture('nfe-proc-completa.xml').replaceAll(CHAVE_FIXTURE, chave)
}

/** Dados válidos de cliente, com a identidade fiscal em teste. */
function dadosCliente(nome: string, identidade: { tipoIdentificacaoFiscal?: string; identificacaoFiscal?: string } = {}) {
  return {
    nome,
    email: `${nome.toLowerCase().replace(/\W+/g, '.')}@identidade.teste`,
    telefone: '11988887777',
    empresaNome: '',
    area: 'contabil' as const,
    status: 'ativo' as const,
    tipoAtendimento: 'mensal' as const,
    valorReferencia: '1.000,00',
    observacoes: '',
    cep: '01310000',
    logradouro: 'Avenida Paulista',
    numero: '1000',
    complemento: '',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    estado: 'SP',
    ...identidade,
  } as Parameters<typeof criarCliente>[0]
}

async function identidadeDoCliente(clienteId: string) {
  const [cliente] = await db
    .select({ tipo: clientes.tipoIdentificacaoFiscal, valor: clientes.identificacaoFiscal })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
  return cliente
}

async function criarClienteComIdentidade(nome: string, identidade: Record<string, string>) {
  entrarComo(cenario.tokens.proprietario)
  const resultado = await criarCliente(dadosCliente(nome, identidade))
  expect(resultado.sucesso, resultado.mensagem).toBe(true)
  const [criado] = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.nome, nome))
  return criado.id
}

async function importar(xml: string, clienteId: string | null) {
  const resultado = await receberXmlsFiscais({
    usuarioId: cenario.ids.proprietario,
    empresaId: cenario.empresaId,
    clienteId,
    arquivos: [new File([xml], `nfe-${sequencia}.xml`, { type: 'application/xml' })],
  })
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
}

const documentoDe = async (id: string) => (await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, id)))[0]

const extracoesDe = async (documentoId: string) =>
  db.select().from(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId))

const arquivosDe = async (documentoId: string) =>
  db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.documentoFiscalId, documentoId))

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
  sairDaSessao()
  await limparFiscal()
  if (cenario) {
    const criados = await db
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(eq(clientes.profissionalId, cenario.ids.proprietario), like(clientes.email, '%@identidade.teste')))
    const ids = criados.map(({ id }) => id)
    if (ids.length) {
      await db.delete(clienteAtribuicoes).where(inArray(clienteAtribuicoes.clienteId, ids))
      await db.delete(colaboracoesCliente).where(inArray(colaboracoesCliente.clienteId, ids))
      await db.delete(clientes).where(inArray(clientes.id, ids))
    }
    await db.update(clientes).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(clientes.id, cenario.clienteA))
    await db.update(empresas).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(empresas.id, cenario.empresaId))
  }
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('identidade fiscal no cadastro do cliente', () => {
  it('CPF, CNPJ e CNPJ alfanumérico são gravados no formato canônico', async () => {
    const comCpf = await criarClienteComIdentidade('Identidade CPF', {
      tipoIdentificacaoFiscal: 'cpf',
      identificacaoFiscal: '123.456.789-09',
    })
    expect(await identidadeDoCliente(comCpf)).toEqual({ tipo: 'cpf', valor: '12345678909' })

    const comCnpj = await criarClienteComIdentidade('Identidade CNPJ', {
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '12.345.678/0001-95',
    })
    expect(await identidadeDoCliente(comCnpj)).toEqual({ tipo: 'cnpj', valor: CNPJ_EMITENTE })

    // CNPJ alfanumérico: letras minúsculas sobem de caixa e sobrevivem.
    const alfanumerico = await criarClienteComIdentidade('Identidade Alfanumerica', {
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '12.abc.345/01de-35',
    })
    expect(await identidadeDoCliente(alfanumerico)).toEqual({ tipo: 'cnpj', valor: '12ABC34501DE35' })

    // Zeros à esquerda continuam: nada vira número.
    const comZeros = await criarClienteComIdentidade('Identidade Zeros', {
      tipoIdentificacaoFiscal: 'cpf',
      identificacaoFiscal: '000.123.456-78',
    })
    expect(await identidadeDoCliente(comZeros)).toEqual({ tipo: 'cpf', valor: '00012345678' })
  })

  it('cliente sem identidade continua sendo cadastrado, e a edição preenche depois', async () => {
    const semIdentidade = await criarClienteComIdentidade('Identidade Ausente', {})
    expect(await identidadeDoCliente(semIdentidade)).toEqual({ tipo: null, valor: null })

    entrarComo(cenario.tokens.proprietario)
    const atualizado = await atualizarCliente(
      semIdentidade,
      dadosCliente('Identidade Ausente', { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: '98.765.432/0001-98' }),
    )
    expect(atualizado.sucesso, atualizado.mensagem).toBe(true)
    expect(await identidadeDoCliente(semIdentidade)).toEqual({ tipo: 'cnpj', valor: CNPJ_DESTINATARIO })

    // E apagar volta ao par vazio, sem deixar metade preenchida.
    const limpo = await atualizarCliente(semIdentidade, dadosCliente('Identidade Ausente', {}))
    expect(limpo.sucesso).toBe(true)
    expect(await identidadeDoCliente(semIdentidade)).toEqual({ tipo: null, valor: null })
  })

  it('formato incompatível com o tipo é recusado pelo servidor', async () => {
    entrarComo(cenario.tokens.proprietario)
    const casos = [
      { tipoIdentificacaoFiscal: 'cpf', identificacaoFiscal: '1234567890' },
      { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: '1234567800019' },
      { tipoIdentificacaoFiscal: 'cpf', identificacaoFiscal: '12.345.678/0001-95' },
      { tipoIdentificacaoFiscal: '', identificacaoFiscal: '12345678909' },
      { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: '' },
    ]
    for (const caso of casos) {
      const resultado = await criarCliente(dadosCliente('Identidade Invalida', caso))
      expect(resultado.sucesso, JSON.stringify(caso)).toBe(false)
    }
    const criados = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.nome, 'Identidade Invalida'))
    expect(criados).toHaveLength(0)
  })

  it('quem não pode editar o cliente também não altera a identidade fiscal dele', async () => {
    entrarComo(cenario.tokens.colaboradorExterno)
    const recusado = await atualizarCliente(
      cenario.clienteA,
      dadosCliente('Cliente A', { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: CNPJ_EMITENTE }),
    )
    expect(recusado.sucesso).toBe(false)
    expect(await identidadeDoCliente(cenario.clienteA)).toEqual({ tipo: null, valor: null })

    entrarComo(cenario.tokens.estranho)
    expect((await atualizarCliente(cenario.clienteB, dadosCliente('Cliente B', { tipoIdentificacaoFiscal: 'cpf', identificacaoFiscal: '12345678909' }))).sucesso).toBe(false)

    // Quem edita o cliente edita a identidade dele.
    entrarComo(cenario.tokens.proprietario)
    const permitido = await atualizarCliente(
      cenario.clienteA,
      dadosCliente('Cliente A', { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: '12.345.678/0001-95' }),
    )
    expect(permitido.sucesso, permitido.mensagem).toBe(true)
    expect(await identidadeDoCliente(cenario.clienteA)).toEqual({ tipo: 'cnpj', valor: CNPJ_EMITENTE })

    // O detalhe devolve o valor canônico, e a máscara é só apresentação.
    const detalhe = await obterMeuCliente(cenario.clienteA)
    expect(detalhe.dados?.identificacaoFiscal).toBe(CNPJ_EMITENTE)
    expect(formatarIdentificacaoFiscal(detalhe.dados?.identificacaoFiscal)).toBe('12.345.678/0001-95')
  })
})

describe('identidade fiscal do escritório', () => {
  const identidadeDaEmpresa = async (empresaId: string) =>
    (
      await db
        .select({ tipo: empresas.tipoIdentificacaoFiscal, valor: empresas.identificacaoFiscal })
        .from(empresas)
        .where(eq(empresas.id, empresaId))
    )[0]

  it('quem administra o escritório salva, edita e remove a identificação', async () => {
    entrarComo(cenario.tokens.proprietario)
    const salvo = await atualizarIdentidadeFiscalEscritorio({
      empresaId: cenario.empresaId,
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '12.345.678/0001-95',
    })
    expect(salvo.sucesso, salvo.mensagem).toBe(true)
    expect(await identidadeDaEmpresa(cenario.empresaId)).toEqual({ tipo: 'cnpj', valor: CNPJ_EMITENTE })

    const editado = await atualizarIdentidadeFiscalEscritorio({
      empresaId: cenario.empresaId,
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '98765432000198',
    })
    expect(editado.sucesso).toBe(true)
    expect(await identidadeDaEmpresa(cenario.empresaId)).toEqual({ tipo: 'cnpj', valor: CNPJ_DESTINATARIO })

    const removido = await atualizarIdentidadeFiscalEscritorio({ empresaId: cenario.empresaId })
    expect(removido.sucesso).toBe(true)
    expect(await identidadeDaEmpresa(cenario.empresaId)).toEqual({ tipo: null, valor: null })
  })

  it('formato inválido é recusado e nada é gravado', async () => {
    entrarComo(cenario.tokens.proprietario)
    const recusado = await atualizarIdentidadeFiscalEscritorio({
      empresaId: cenario.empresaId,
      tipoIdentificacaoFiscal: 'cpf',
      identificacaoFiscal: '123',
    })
    expect(recusado.sucesso).toBe(false)
    expect(await identidadeDaEmpresa(cenario.empresaId)).toEqual({ tipo: null, valor: null })
  })

  it('quem não administra o escritório não altera — nem em escritório alheio', async () => {
    for (const persona of ['profissionalMembro', 'colaboradorMembro', 'estranho'] as const) {
      entrarComo(cenario.tokens[persona])
      const resultado = await atualizarIdentidadeFiscalEscritorio({
        empresaId: cenario.empresaId,
        tipoIdentificacaoFiscal: 'cnpj',
        identificacaoFiscal: CNPJ_EMITENTE,
      })
      expect(resultado.sucesso, persona).toBe(false)
    }
    entrarComo(cenario.tokens.proprietario)
    const emOutroEscritorio = await atualizarIdentidadeFiscalEscritorio({
      empresaId: cenario.empresaGestorId,
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: CNPJ_EMITENTE,
    })
    expect(emOutroEscritorio.sucesso).toBe(false)
    expect(await identidadeDaEmpresa(cenario.empresaId)).toEqual({ tipo: null, valor: null })
  })
})

describe('classificação com a identidade cadastrada', () => {
  it('contribuinte emitente → emitido; contribuinte destinatário → recebido', async () => {
    const emitente = await criarClienteComIdentidade('Contribuinte Emitente', {
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '12.345.678/0001-95',
    })
    const destinatario = await criarClienteComIdentidade('Contribuinte Destinatario', {
      tipoIdentificacaoFiscal: 'cnpj',
      identificacaoFiscal: '98.765.432/0001-98',
    })

    const daSaida = await importar(nfeCompleta(), emitente)
    const daEntrada = await importar(nfeCompleta(), destinatario)
    if (daSaida.codigo !== 'ACEITO' || daEntrada.codigo !== 'ACEITO') throw new Error('esperava aceitos')
    expect((await documentoDe(daSaida.documentoId)).sentido).toBe('emitido')
    expect((await documentoDe(daEntrada.documentoId)).sentido).toBe('recebido')
  })
})

describe('entrada do reprocessamento', () => {
  it('sem sessão, sem permissão ou de outro escritório: mesma resposta, sem vazar id', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    sairDaSessao()
    expect(await reprocessarDocumentoFiscalAction(importado.documentoId)).toMatchObject({
      sucesso: false,
      codigo: 'SEM_PERMISSAO',
      documentoId: null,
    })

    for (const persona of ['colaboradorMembro', 'gestorProfissional', 'estranho', 'gestor'] as const) {
      entrarComo(cenario.tokens[persona])
      expect(await reprocessarDocumentoFiscalAction(importado.documentoId), persona).toMatchObject({
        sucesso: false,
        codigo: 'SEM_PERMISSAO',
        documentoId: null,
      })
    }

    entrarComo(cenario.tokens.proprietario)
    expect(await reprocessarDocumentoFiscalAction('não-é-uuid')).toMatchObject({ sucesso: false, codigo: 'REQUISICAO_INVALIDA' })
    // Nenhuma tentativa recusada criou leitura nova.
    expect(await extracoesDe(importado.documentoId)).toHaveLength(1)
  })

  it('documento nao_determinado recalcula o sentido depois do cadastro da identidade', async () => {
    const xml = nfeCompleta()
    const cliente = await criarClienteComIdentidade('Contribuinte Sem Identidade', {})
    const importado = await importar(xml, cliente)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(importado.documentoId)).sentido).toBe('nao_determinado')
    const [arquivoOriginal] = await arquivosDe(importado.documentoId)
    const shaAntes = calcularSha256(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)

    entrarComo(cenario.tokens.proprietario)
    const cadastro = await atualizarCliente(
      cliente,
      dadosCliente('Contribuinte Sem Identidade', { tipoIdentificacaoFiscal: 'cnpj', identificacaoFiscal: '12.345.678/0001-95' }),
    )
    expect(cadastro.sucesso, cadastro.mensagem).toBe(true)
    // Cadastro não reclassifica histórico sozinho.
    expect((await documentoDe(importado.documentoId)).sentido).toBe('nao_determinado')

    const resultado = await reprocessarDocumentoFiscalAction(importado.documentoId)
    expect(resultado).toMatchObject({
      sucesso: true,
      codigo: 'REPROCESSADO',
      documentoId: importado.documentoId,
      status: 'processado',
      sentido: 'emitido',
    })
    expect((await documentoDe(importado.documentoId)).sentido).toBe('emitido')

    // Um documento, um original idêntico, histórico de leituras preservado.
    const documentos = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(eq(documentosFiscais.clienteId, cliente))
    expect(documentos).toHaveLength(1)
    expect(await arquivosDe(importado.documentoId)).toHaveLength(1)
    const extracoes = await extracoesDe(importado.documentoId)
    expect(extracoes).toHaveLength(2)
    expect(extracoes.filter((e) => e.vigente)).toHaveLength(1)
    expect(calcularSha256(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)).toBe(shaAntes)
    expect(new TextDecoder().decode(armazenamento.objetos.get(arquivoOriginal.chaveArmazenamento)!)).toBe(xml)
  })

  it('documento com processamento falhou pode ser reprocessado, e a resposta não vaza detalhe interno', async () => {
    const importado = await importar(lerFixture('nfe-versao-nao-suportada.xml'), cenario.clienteA)
    if (importado.codigo !== 'DOCUMENTO_NAO_INTERPRETADO') throw new Error('esperava não interpretado')

    entrarComo(cenario.tokens.proprietario)
    const resultado = await reprocessarDocumentoFiscalAction(importado.documentoId)
    expect(resultado).toMatchObject({
      sucesso: false,
      codigo: 'NAO_INTERPRETADO',
      documentoId: importado.documentoId,
      status: 'falhou',
      sentido: null,
    })
    expect(await extracoesDe(importado.documentoId)).toHaveLength(2)
    expect((await documentoDe(importado.documentoId)).statusProcessamento).toBe('falhou')

    const serializado = JSON.stringify(resultado)
    for (const proibido of ['documentos-fiscais/', '<', 'select', 'Error']) {
      expect(serializado).not.toContain(proibido)
    }
  })

  it('o reprocessamento registra uma única auditoria, sem conteúdo fiscal', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const antes = await db.select().from(eventosAuditoria).where(eq(eventosAuditoria.registroAfetado, importado.documentoId))

    entrarComo(cenario.tokens.proprietario)
    expect((await reprocessarDocumentoFiscalAction(importado.documentoId)).sucesso).toBe(true)

    const depois = await db.select().from(eventosAuditoria).where(eq(eventosAuditoria.registroAfetado, importado.documentoId))
    expect(depois).toHaveLength(antes.length + 1)
    const novo = depois.find((evento) => !antes.some((anterior) => anterior.id === evento.id))!
    expect(novo.acao).toBe('documento_fiscal_processado')
    const serializado = JSON.stringify(novo.metadados)
    for (const proibido of ['Café', CNPJ_EMITENTE, '376.01', '<']) {
      expect(serializado).not.toContain(proibido)
    }
  })
})
