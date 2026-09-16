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
  empresas,
  eventosAuditoria,
  perfisPermissoes,
} from '@/db/schema'
import {
  classificarIdentificacaoFiscal,
  determinarSentidoFiscal,
  lerIdentidadeFiscal,
  mesmaIdentidadeFiscal,
  normalizarIdentificacaoFiscal,
} from '@/features/documentos-fiscais/lib/identidade-fiscal'
import { interpretarNfe } from '@/features/documentos-fiscais/lib/parser-fiscal/interpretar-nfe'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

/*
  Fase 1.5 — identidade fiscal, sentido da NF-e e identidade do documento.

  O armazenamento é simulado; cadastro, autorização, parser, transação e índices
  são reais. Fixtures sintéticas.
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

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'
const CNPJ_EMITENTE = '12345678000195'
const CNPJ_DESTINATARIO = '98765432000198'

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

async function importar(xml: string, clienteId: string | null, empresaId = cenario.empresaId, persona: keyof Cenario['ids'] = 'proprietario') {
  const resultado = await receberXmlsFiscais({
    usuarioId: cenario.ids[persona],
    empresaId,
    clienteId,
    arquivos: [arquivo(xml)],
  })
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
}

async function documentoDe(documentoId: string) {
  const [documento] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, documentoId))
  return documento
}

/** O cadastro guarda a identidade normalizada — a máscara é coisa de tela. */
async function definirIdentidade(clienteId: string, identificacao: string | null, tipo: string | null = 'cnpj') {
  const normalizada = normalizarIdentificacaoFiscal(identificacao)
  await db
    .update(clientes)
    .set({ identificacaoFiscal: normalizada, tipoIdentificacaoFiscal: normalizada ? tipo : null })
    .where(eq(clientes.id, clienteId))
}

async function limparFiscal() {
  if (!cenario) return
  const empresasDoCenario = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresasDoCenario))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    // Ordem das FKs: extração → arquivo (que pode apontar para evento) → evento.
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
    await definirIdentidade(cenario.clienteA, null)
    await definirIdentidade(cenario.clienteB, null)
    await db.update(empresas).set({ identificacaoFiscal: null, tipoIdentificacaoFiscal: null }).where(eq(empresas.id, cenario.empresaId))
  }
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('normalização e comparação de identificadores fiscais', () => {
  it('tira máscara, sobe a caixa e preserva letras — sem virar número', () => {
    expect(normalizarIdentificacaoFiscal('12.345.678/0001-95')).toBe('12345678000195')
    expect(normalizarIdentificacaoFiscal(' 123.456.789-09 ')).toBe('12345678909')
    // CNPJ alfanumérico: letra é conteúdo, não ruído.
    expect(normalizarIdentificacaoFiscal('12.abc.345/01de-35')).toBe('12ABC34501DE35')
    // Zeros à esquerda sobrevivem porque nada vira `number`.
    expect(normalizarIdentificacaoFiscal('000.123.456-78')).toBe('00012345678')
    expect(normalizarIdentificacaoFiscal('')).toBeNull()
    expect(normalizarIdentificacaoFiscal(null)).toBeNull()
    expect(normalizarIdentificacaoFiscal('não é identificador!')).toBeNull()
  })

  it('classifica pelo formato e compara por tipo + valor', () => {
    expect(classificarIdentificacaoFiscal('12.345.678/0001-95')).toBe('cnpj')
    expect(classificarIdentificacaoFiscal('12ABC34501DE35')).toBe('cnpj')
    expect(classificarIdentificacaoFiscal('12345678909')).toBe('cpf')
    expect(classificarIdentificacaoFiscal('AB-1234567')).toBe('estrangeiro')

    const comMascara = lerIdentidadeFiscal({ identificacao: '12.345.678/0001-95' })
    const semMascara = lerIdentidadeFiscal({ identificacao: '12345678000195', tipo: 'cnpj' })
    expect(mesmaIdentidadeFiscal(comMascara, semMascara)).toBe(true)
    // Mesmo texto, tipos diferentes: não é o mesmo contribuinte.
    expect(
      mesmaIdentidadeFiscal(semMascara, lerIdentidadeFiscal({ identificacao: '12345678000195', tipo: 'estrangeiro' })),
    ).toBe(false)
    expect(mesmaIdentidadeFiscal(null, semMascara)).toBe(false)
  })

  it('sentido: emitente, destinatário, ambíguo, ausente — sem CFOP e sem palpite', () => {
    const leitura = interpretarNfe(lerFixture('nfe-proc-completa.xml'))
    if (!leitura.sucesso) throw new Error('fixture deveria interpretar')
    const documento = leitura.documento
    const identidade = (valor: string) => lerIdentidadeFiscal({ identificacao: valor })

    expect(determinarSentidoFiscal(documento, identidade('12.345.678/0001-95'))).toBe('emitido')
    expect(determinarSentidoFiscal(documento, identidade(CNPJ_DESTINATARIO))).toBe('recebido')
    expect(determinarSentidoFiscal(documento, identidade('11222333000181'))).toBe('nao_determinado')
    expect(determinarSentidoFiscal(documento, null)).toBe('nao_determinado')

    // Emitente e destinatário iguais: ambiguidade legítima não vira classificação.
    const mesmaParte = interpretarNfe(lerFixture('nfe-proc-completa.xml').replace(`<CNPJ>${CNPJ_DESTINATARIO}</CNPJ>`, `<CNPJ>${CNPJ_EMITENTE}</CNPJ>`))
    if (!mesmaParte.sucesso) throw new Error('fixture deveria interpretar')
    expect(determinarSentidoFiscal(mesmaParte.documento, identidade(CNPJ_EMITENTE))).toBe('nao_determinado')
  })
})

describe('sentido persistido na importação', () => {
  it('contribuinte emitente → emitido; contribuinte destinatário → recebido', async () => {
    // A identidade do cadastro vem com máscara: a comparação normaliza.
    await definirIdentidade(cenario.clienteA, '12.345.678/0001-95')
    await definirIdentidade(cenario.clienteB, CNPJ_DESTINATARIO)

    const emitida = await importar(nfeCompleta(), cenario.clienteA)
    const recebida = await importar(nfeCompleta(), cenario.clienteB)
    if (emitida.codigo !== 'ACEITO' || recebida.codigo !== 'ACEITO') throw new Error('esperava aceitos')

    expect((await documentoDe(emitida.documentoId)).sentido).toBe('emitido')
    expect((await documentoDe(recebida.documentoId)).sentido).toBe('recebido')
  })

  it('sem identidade cadastrada, ou sem correspondência, fica nao_determinado', async () => {
    await definirIdentidade(cenario.clienteA, null)
    const semIdentidade = await importar(nfeCompleta(), cenario.clienteA)
    if (semIdentidade.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(semIdentidade.documentoId)).sentido).toBe('nao_determinado')

    await definirIdentidade(cenario.clienteA, '11222333000181')
    const outroContribuinte = await importar(nfeCompleta(), cenario.clienteA)
    if (outroContribuinte.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(outroContribuinte.documentoId)).sentido).toBe('nao_determinado')
  })

  it('documento do próprio escritório usa a identidade da empresa', async () => {
    const semIdentidade = await importar(nfeCompleta(), null)
    if (semIdentidade.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(semIdentidade.documentoId)).sentido).toBe('nao_determinado')

    await db
      .update(empresas)
      .set({ identificacaoFiscal: CNPJ_EMITENTE, tipoIdentificacaoFiscal: 'cnpj' })
      .where(eq(empresas.id, cenario.empresaId))
    const doEscritorio = await importar(nfeCompleta(), null)
    if (doEscritorio.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(doEscritorio.documentoId)).sentido).toBe('emitido')
  })

  it('CNPJ com máscara no XML é normalizado na gravação, sem derrubar a importação', async () => {
    await definirIdentidade(cenario.clienteA, CNPJ_EMITENTE)
    const comMascara = await importar(nfeCompleta((xml) => xml.replace(`<CNPJ>${CNPJ_EMITENTE}</CNPJ>`, '<CNPJ>12.345.678/0001-95</CNPJ>')), cenario.clienteA)
    if (comMascara.codigo !== 'ACEITO') throw new Error(`esperava aceito, veio ${comMascara.codigo}`)
    const documento = await documentoDe(comMascara.documentoId)
    expect(documento.emitenteIdentificacao).toBe(CNPJ_EMITENTE)
    expect(documento.sentido).toBe('emitido')
    const [extracao] = await db.select().from(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.documentoFiscalId, documento.id))
    const partes = await db.select().from(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, extracao.id))
    const emitente = partes.find((p) => p.papel === 'emitente')!
    expect(emitente.identificacao).toBe(CNPJ_EMITENTE)
    // O valor como veio no arquivo continua registrado.
    expect(emitente.dadosEspecificos).toMatchObject({ identificacaoComoRecebida: '12.345.678/0001-95' })
  })

  it('CNPJ alfanumérico e CPF são reconhecidos como qualquer outro identificador', async () => {
    await definirIdentidade(cenario.clienteA, '12.abc.345/01de-35')
    const alfanumerico = await importar(lerFixture('nfe-proc-prefixo.xml'), cenario.clienteA)
    if (alfanumerico.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const documento = await documentoDe(alfanumerico.documentoId)
    expect(documento.emitenteIdentificacao).toBe('12ABC34501DE35')
    expect(documento.sentido).toBe('emitido')

    await definirIdentidade(cenario.clienteB, '123.456.789-09', 'cpf')
    const daPessoaFisica = await importar(lerFixture('nfe-sem-proc-cpf.xml'), cenario.clienteB)
    if (daPessoaFisica.codigo !== 'ACEITO') throw new Error('esperava aceito')
    expect((await documentoDe(daPessoaFisica.documentoId)).sentido).toBe('recebido')
  })
})

describe('identidade do documento fiscal', () => {
  it('a mesma NF-e é um documento por contribuinte — e o sentido de cada um é o seu', async () => {
    await definirIdentidade(cenario.clienteA, CNPJ_EMITENTE)
    await definirIdentidade(cenario.clienteB, CNPJ_DESTINATARIO)
    const xml = nfeCompleta()

    const doA = await importar(xml, cenario.clienteA)
    const doB = await importar(xml, cenario.clienteB)
    if (doA.codigo !== 'ACEITO' || doB.codigo !== 'ACEITO') throw new Error('esperava dois documentos')
    expect(doB.documentoId).not.toBe(doA.documentoId)

    const [documentoA, documentoB] = [await documentoDe(doA.documentoId), await documentoDe(doB.documentoId)]
    expect(documentoA.chaveAcesso).toBe(documentoB.chaveAcesso)
    // A escrituração é de cada contribuinte: a mesma nota é saída de um e entrada do outro.
    expect(documentoA.sentido).toBe('emitido')
    expect(documentoB.sentido).toBe('recebido')
  })

  it('reenvio para o mesmo contribuinte não cria segunda NF-e, por arquivo ou por chave', async () => {
    const xml = nfeCompleta()
    const primeiro = await importar(xml, cenario.clienteA)
    if (primeiro.codigo !== 'ACEITO') throw new Error('esperava aceito')

    // Mesmo arquivo: repetição do SHA-256.
    expect(await importar(xml, cenario.clienteA)).toMatchObject({ codigo: 'ARQUIVO_DUPLICADO', documentoId: primeiro.documentoId })
    // Outro arquivo, mesma NF-e: repetição da chave de acesso.
    expect(await importar(`${xml}\n`, cenario.clienteA)).toMatchObject({ codigo: 'DOCUMENTO_DUPLICADO', documentoId: primeiro.documentoId })

    const documentos = await db
      .select({ id: documentosFiscais.id })
      .from(documentosFiscais)
      .where(and(eq(documentosFiscais.empresaId, cenario.empresaId), eq(documentosFiscais.clienteId, cenario.clienteA), eq(documentosFiscais.chaveAcesso, (await documentoDe(primeiro.documentoId)).chaveAcesso!)))
    expect(documentos).toHaveLength(1)
  })

  it('a mesma chave em escritórios diferentes são documentos independentes', async () => {
    const xml = nfeCompleta()
    const noAlfa = await importar(xml, cenario.clienteA)
    const noGestor = await importar(xml, null, cenario.empresaGestorId, 'gestorProfissional')
    if (noAlfa.codigo !== 'ACEITO' || noGestor.codigo !== 'ACEITO') throw new Error('esperava aceitos')

    const [alfa, gestor] = [await documentoDe(noAlfa.documentoId), await documentoDe(noGestor.documentoId)]
    expect(alfa.chaveAcesso).toBe(gestor.chaveAcesso)
    expect(alfa.empresaId).toBe(cenario.empresaId)
    expect(gestor.empresaId).toBe(cenario.empresaGestorId)
  })

  it('a regra do documento principal não impede eventos da mesma chave', async () => {
    const importado = await importar(nfeCompleta(), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')

    // Cancelamento da mesma NF-e, com o seu próprio XML: cabe no modelo sem
    // criar outro documento e sem esbarrar em nenhum índice do documento.
    const [evento] = await db
      .insert(documentosFiscaisEventos)
      .values({
        documentoFiscalId: importado.documentoId,
        tipo: 'cancelamento',
        codigoEvento: '110111',
        sequencia: 1,
        protocolo: '135260000000009',
        ocorridoEm: new Date(),
        origem: 'envio_usuario',
        registradoPorId: cenario.ids.proprietario,
        dadosEspecificos: { codigoStatus: '135' },
      })
      .returning({ id: documentosFiscaisEventos.id })

    const [arquivoDoEvento] = await db
      .insert(documentosFiscaisArquivos)
      .values({
        empresaId: cenario.empresaId,
        documentoFiscalId: importado.documentoId,
        eventoFiscalId: evento.id,
        tipoArquivo: 'xml',
        nomeOriginal: 'cancelamento.xml',
        tipoMime: 'application/xml',
        tamanhoBytes: 10,
        chaveArmazenamento: `documentos-fiscais/${cenario.empresaId}/${importado.documentoId}/evento-${evento.id}.xml`,
        sha256: 'a'.repeat(64),
        enviadoPorId: cenario.ids.proprietario,
      })
      .returning({ id: documentosFiscaisArquivos.id })

    expect(arquivoDoEvento.id).toBeTruthy()
    const eventos = await db.select().from(documentosFiscaisEventos).where(eq(documentosFiscaisEventos.documentoFiscalId, importado.documentoId))
    // A autorização veio do protocolo na importação; o cancelamento é outro evento.
    expect(eventos.map((e) => e.tipo).sort()).toEqual(['autorizacao', 'cancelamento'])
    const documentos = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(eq(documentosFiscais.chaveAcesso, (await documentoDe(importado.documentoId)).chaveAcesso!))
    expect(documentos).toHaveLength(1)
  })

  it('duplicidade não cria partes, itens nem extrações a mais', async () => {
    const xml = nfeCompleta()
    const primeiro = await importar(xml, cenario.clienteA)
    if (primeiro.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const extracoes = await db.select({ id: documentosFiscaisExtracoes.id }).from(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.documentoFiscalId, primeiro.documentoId))
    const itensAntes = await db.select({ id: documentosFiscaisItens.id }).from(documentosFiscaisItens).where(eq(documentosFiscaisItens.extracaoId, extracoes[0].id))
    const partesAntes = await db.select({ id: documentosFiscaisPartes.id }).from(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, extracoes[0].id))

    await importar(xml, cenario.clienteA)
    await importar(`${xml} `, cenario.clienteA)

    expect(await db.select({ id: documentosFiscaisExtracoes.id }).from(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.documentoFiscalId, primeiro.documentoId))).toHaveLength(extracoes.length)
    expect(await db.select({ id: documentosFiscaisItens.id }).from(documentosFiscaisItens).where(eq(documentosFiscaisItens.extracaoId, extracoes[0].id))).toHaveLength(itensAntes.length)
    expect(await db.select({ id: documentosFiscaisPartes.id }).from(documentosFiscaisPartes).where(eq(documentosFiscaisPartes.extracaoId, extracoes[0].id))).toHaveLength(partesAntes.length)
  })
})
