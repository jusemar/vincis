import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  perfis,
  perfisPermissoes,
  permissoes,
} from '@/db/schema'
import {
  METODOS_EXTRACAO_FISCAL,
  ORIGENS_DOCUMENTO_FISCAL,
  PAPEIS_PARTE_FISCAL,
  SENTIDOS_DOCUMENTO_FISCAL,
  SITUACOES_DOCUMENTO_FISCAL,
  STATUS_EXTRACAO_FISCAL,
  STATUS_PROCESSAMENTO_FISCAL,
  STATUS_REVISAO_FISCAL,
  TIPOS_ARQUIVO_FISCAL,
  TIPOS_DOCUMENTO_FISCAL,
  TIPOS_EVENTO_FISCAL,
  TRIBUTOS_CONHECIDOS,
  FORMATO_CODIGO_TRIBUTO,
} from '@/features/documentos-fiscais/constants/dominio'
import {
  PERMISSOES_DOCUMENTOS_FISCAIS,
  PERMISSOES_FISCAIS_POR_PERFIL,
} from '@/features/documentos-fiscais/constants/permissoes'
import {
  clienteNoEscopoDoEscritorio,
  condicaoEscopoDocumentosFiscais,
  resolverAcessoDocumentoFiscal,
  resolverAcessoDocumentosFiscais,
} from '@/features/documentos-fiscais/lib/acesso-documentos-fiscais'
import { metadadosAuditoriaFiscal } from '@/features/documentos-fiscais/lib/auditoria'
import { buscarPermissoesUsuario } from '@/features/usuarios/queries/buscar-permissoes-usuario'
import { limparCenario, montarCenario, type Cenario, type Persona } from './setup/personas'

/*
  Fundação da Central Fiscal (Fase 1.1): o banco que as próximas fases vão
  preencher, as permissões no RBAC e a fronteira de acesso por escritório.
  Nenhum upload, parser ou integração é exercitado — eles não existem.

  Os documentos daqui são descartáveis e criados à mão, com chaves e CNPJs
  fictícios.
*/

const P = PERMISSOES_DOCUMENTOS_FISCAIS
const MIGRATION = readFileSync(
  path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'),
  'utf8',
)
const CHAVE_A = '35260912345678000195550010000000011000000010'
const SHA = 'a'.repeat(64)

let cenario: Cenario
let vinculosFiscaisCriados: { perfilId: string; permissaoId: string }[] = []

async function limparFiscal() {
  if (!cenario) return
  const empresasAlvo = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db
    .select({ id: documentosFiscais.id })
    .from(documentosFiscais)
    .where(inArray(documentosFiscais.empresaId, empresasAlvo))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscais).where(inArray(documentosFiscais.id, ids))
  }
}

async function criarDocumento(valores: Partial<typeof documentosFiscais.$inferInsert> = {}) {
  const [doc] = await db
    .insert(documentosFiscais)
    .values({ empresaId: cenario.empresaId, origem: 'envio_usuario', ...valores })
    .returning({ id: documentosFiscais.id, empresaId: documentosFiscais.empresaId })
  return doc
}

async function criarArquivo(documento: { id: string; empresaId: string }, extra: Partial<typeof documentosFiscaisArquivos.$inferInsert> = {}) {
  const [arquivo] = await db
    .insert(documentosFiscaisArquivos)
    .values({
      empresaId: documento.empresaId,
      documentoFiscalId: documento.id,
      tipoArquivo: 'xml',
      nomeOriginal: 'nota.xml',
      tipoMime: 'application/xml',
      tamanhoBytes: 1024,
      chaveArmazenamento: `documentos-fiscais/${crypto.randomUUID()}`,
      sha256: SHA,
      ...extra,
    })
    .returning({ id: documentosFiscaisArquivos.id })
  return arquivo
}

async function criarExtracao(documentoId: string, arquivoId: string | null, extra: Partial<typeof documentosFiscaisExtracoes.$inferInsert> = {}) {
  const [extracao] = await db
    .insert(documentosFiscaisExtracoes)
    .values({
      documentoFiscalId: documentoId,
      arquivoId,
      metodo: 'parser_xml',
      provedor: 'vincis',
      versao: 'teste',
      status: 'concluida',
      finalizadaEm: new Date(),
      ...extra,
    })
    .returning({ id: documentosFiscaisExtracoes.id })
  return extracao
}

/** Postgres devolve a violação dentro de `cause`; o teste só quer saber se foi recusado. */
async function recusado(operacao: Promise<unknown>) {
  try {
    await operacao
    return false
  } catch {
    return true
  }
}

/** Nome da constraint violada — prova que a recusa veio da regra certa. */
async function violacao(operacao: Promise<unknown>) {
  try {
    await operacao
    return null
  } catch (erro) {
    const causa = (erro as { cause?: { constraint_name?: string } }).cause
    return causa?.constraint_name ?? (erro as { constraint_name?: string }).constraint_name ?? 'desconhecida'
  }
}

/** Literais `'x'` de uma constraint check, lidos do banco real. */
async function valoresDoCheck(nome: string) {
  const resultado = await db.execute<{ def: string }>(
    sql`select pg_get_constraintdef(oid) as def from pg_constraint where conname = ${nome}`,
  )
  const def = resultado[0]?.def ?? ''
  return [...def.matchAll(/'([a-z_]+)'/g)].map(([, valor]) => valor).sort()
}

beforeAll(async () => {
  cenario = await montarCenario()

  // Os perfis do cenário nascem depois das migrations, então os vínculos da
  // 0066 não os alcançaram. Roda-se aqui exatamente o SQL de carga da migration
  // — é ele que vai para os bancos reais, e é ele que precisa estar certo.
  const antes = await db.select().from(perfisPermissoes)
  const carga = MIGRATION.split('--> statement-breakpoint')
    .map((trecho) => trecho.trim())
    .filter((trecho) => trecho.startsWith('INSERT INTO'))
  expect(carga).toHaveLength(2)
  for (const comando of carga) await db.execute(sql.raw(comando))

  const depois = await db.select().from(perfisPermissoes)
  const chave = (v: { perfilId: string; permissaoId: string }) => `${v.perfilId}:${v.permissaoId}`
  const existentes = new Set(antes.map(chave))
  vinculosFiscaisCriados = depois.filter((v) => !existentes.has(chave(v)))
})

afterAll(async () => {
  await limparFiscal()
  for (const vinculo of vinculosFiscaisCriados) {
    await db
      .delete(perfisPermissoes)
      .where(and(eq(perfisPermissoes.perfilId, vinculo.perfilId), eq(perfisPermissoes.permissaoId, vinculo.permissaoId)))
  }
  await limparCenario()
})

describe('vocabulário do domínio espelha os checks do banco', () => {
  it.each([
    ['documentos_fiscais_origem_valida', ORIGENS_DOCUMENTO_FISCAL],
    ['documentos_fiscais_status_processamento_valido', STATUS_PROCESSAMENTO_FISCAL],
    ['documentos_fiscais_status_revisao_valido', STATUS_REVISAO_FISCAL],
    ['documentos_fiscais_situacao_valida', SITUACOES_DOCUMENTO_FISCAL],
    ['documentos_fiscais_sentido_valido', SENTIDOS_DOCUMENTO_FISCAL],
    ['documentos_fiscais_tipo_valido', TIPOS_DOCUMENTO_FISCAL],
    ['documentos_fiscais_eventos_tipo_valido', TIPOS_EVENTO_FISCAL],
    ['documentos_fiscais_eventos_origem_valida', ORIGENS_DOCUMENTO_FISCAL],
    ['documentos_fiscais_arquivos_tipo_valido', TIPOS_ARQUIVO_FISCAL],
    ['documentos_fiscais_extracoes_metodo_valido', METODOS_EXTRACAO_FISCAL],
    ['documentos_fiscais_extracoes_status_valido', STATUS_EXTRACAO_FISCAL],
    ['documentos_fiscais_partes_papel_valido', PAPEIS_PARTE_FISCAL],
  ])('%s', async (constraint, lista) => {
    expect(await valoresDoCheck(constraint)).toEqual([...lista].sort())
  })

  it('tributos conhecidos respeitam o formato que o banco exige', () => {
    for (const tributo of TRIBUTOS_CONHECIDOS) expect(tributo).toMatch(FORMATO_CODIGO_TRIBUTO)
  })
})

describe('documento, chave de acesso e eventos', () => {
  // Cada caso usa a sua própria chave: nenhum depende do que o anterior gravou.
  const chaveDoCaso = (n: number) => `352609123456780001955500100000${String(n).padStart(4, '0')}1000000010`

  it('mesma empresa + mesmo cliente + mesma chave: duplicidade bloqueada pelo índice', async () => {
    const chave = chaveDoCaso(1)
    await criarDocumento({ clienteId: cenario.clienteA, chaveAcesso: chave })
    expect(await violacao(criarDocumento({ clienteId: cenario.clienteA, chaveAcesso: chave }))).toBe(
      'documentos_fiscais_chave_unica',
    )
  })

  it('mesma empresa + cliente nulo + mesma chave: duplicidade bloqueada (NULL não escapa da unicidade)', async () => {
    const chave = chaveDoCaso(2)
    await criarDocumento({ clienteId: null, chaveAcesso: chave })
    expect(await violacao(criarDocumento({ clienteId: null, chaveAcesso: chave }))).toBe(
      'documentos_fiscais_chave_unica',
    )
    // Nem por concorrência: as duas inserções simultâneas não passam juntas.
    const chaveConcorrente = chaveDoCaso(3)
    const resultados = await Promise.allSettled([
      criarDocumento({ chaveAcesso: chaveConcorrente }),
      criarDocumento({ chaveAcesso: chaveConcorrente }),
    ])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  })

  it('mesma empresa + clientes diferentes + mesma chave: permitido, são perspectivas fiscais distintas', async () => {
    const chave = chaveDoCaso(4)
    // Saída do cliente A é entrada do cliente B, e o escritório pode ter a sua própria.
    await criarDocumento({ clienteId: cenario.clienteA, chaveAcesso: chave, sentido: 'emitido' })
    await criarDocumento({ clienteId: cenario.clienteB, chaveAcesso: chave, sentido: 'recebido' })
    await criarDocumento({ clienteId: null, chaveAcesso: chave })
    // Outro escritório nunca colide com este.
    await criarDocumento({ empresaId: cenario.empresaGestorId, clienteId: null, chaveAcesso: chave })

    const gravados = await db
      .select({ id: documentosFiscais.id })
      .from(documentosFiscais)
      .where(eq(documentosFiscais.chaveAcesso, chave))
    expect(gravados).toHaveLength(4)
  })

  it('documento ainda sem chave não entra na unicidade', async () => {
    await criarDocumento({ clienteId: null })
    await criarDocumento({ clienteId: null })
    await criarDocumento({ clienteId: cenario.clienteA })
    await criarDocumento({ clienteId: cenario.clienteA })
  })

  it('aceita chave alfanumérica e recusa chave com máscara', async () => {
    await criarDocumento({ chaveAcesso: '35260912ABC34501DE35550010000000031000000030' })
    expect(await recusado(criarDocumento({ chaveAcesso: '3526 0912 3456' }))).toBe(true)
  })

  it('eventos legítimos da mesma NF-e continuam permitidos, com ou sem cliente', async () => {
    const chave = chaveDoCaso(5)
    for (const clienteId of [cenario.clienteA, null]) {
      const doc = await criarDocumento({ clienteId, chaveAcesso: chave })
      const evento = (tipo: string, codigoEvento: string, sequencia: number) =>
        db.insert(documentosFiscaisEventos).values({ documentoFiscalId: doc.id, tipo, codigoEvento, sequencia, origem: 'envio_usuario' })

      await evento('autorizacao', '', 1)
      await evento('carta_correcao', '110110', 1)
      await evento('carta_correcao', '110110', 2)
      await evento('cancelamento', '110111', 1)
      expect(await violacao(evento('carta_correcao', '110110', 1))).toBe('documentos_fiscais_eventos_unico')
      expect(await recusado(evento('evento_inventado', '999999', 1))).toBe(true)

      const doDocumento = await db
        .select({ id: documentosFiscaisEventos.id })
        .from(documentosFiscaisEventos)
        .where(eq(documentosFiscaisEventos.documentoFiscalId, doc.id))
      expect(doDocumento).toHaveLength(4)
    }
    // O documento em si continua único na perspectiva, mesmo com os eventos gravados.
    expect(await violacao(criarDocumento({ clienteId: null, chaveAcesso: chave }))).toBe('documentos_fiscais_chave_unica')
  })

  it('documento processado precisa saber o tipo e quando foi lido', async () => {
    expect(await recusado(criarDocumento({ statusProcessamento: 'processado' }))).toBe(true)
    await criarDocumento({ statusProcessamento: 'processado', tipo: 'nfe', processadoEm: new Date() })
  })
})

describe('arquivo original', () => {
  it('não aponta para documento de outro escritório', async () => {
    const doc = await criarDocumento()
    expect(await recusado(criarArquivo({ id: doc.id, empresaId: cenario.empresaGestorId }))).toBe(true)
    await criarArquivo(doc)
  })

  it('arquivo de evento pertence ao mesmo documento do evento', async () => {
    const doc1 = await criarDocumento()
    const doc2 = await criarDocumento()
    const [evento] = await db
      .insert(documentosFiscaisEventos)
      .values({ documentoFiscalId: doc1.id, tipo: 'cancelamento', codigoEvento: '110111', origem: 'envio_usuario' })
      .returning({ id: documentosFiscaisEventos.id })

    expect(await recusado(criarArquivo(doc2, { eventoFiscalId: evento.id }))).toBe(true)
    await criarArquivo(doc1, { eventoFiscalId: evento.id })
  })

  it('mesmo SHA-256 é detectável, não bloqueado; formato inválido é recusado', async () => {
    const doc1 = await criarDocumento()
    const doc2 = await criarDocumento()
    await criarArquivo(doc1, { sha256: 'b'.repeat(64) })
    await criarArquivo(doc2, { sha256: 'b'.repeat(64) })

    const iguais = await db
      .select({ id: documentosFiscaisArquivos.id })
      .from(documentosFiscaisArquivos)
      .where(and(eq(documentosFiscaisArquivos.empresaId, cenario.empresaId), eq(documentosFiscaisArquivos.sha256, 'b'.repeat(64))))
    expect(iguais).toHaveLength(2)

    expect(await recusado(criarArquivo(doc1, { sha256: 'B'.repeat(64) }))).toBe(true)
    expect(await recusado(criarArquivo(doc1, { tamanhoBytes: 0 }))).toBe(true)
  })

  it('documento com arquivo não é apagado fisicamente', async () => {
    const doc = await criarDocumento()
    await criarArquivo(doc)
    expect(await recusado(db.delete(documentosFiscais).where(eq(documentosFiscais.id, doc.id)))).toBe(true)
  })
})

describe('extrações e dados derivados', () => {
  it('no máximo uma extração vigente, e só concluída', async () => {
    const doc = await criarDocumento()
    const arquivo = await criarArquivo(doc)
    await criarExtracao(doc.id, arquivo.id, { vigente: true })
    expect(await recusado(criarExtracao(doc.id, arquivo.id, { vigente: true }))).toBe(true)
    expect(
      await recusado(criarExtracao(doc.id, arquivo.id, { status: 'processando', finalizadaEm: null, vigente: false })),
    ).toBe(false)
    expect(
      await recusado(criarExtracao(doc.id, arquivo.id, { status: 'processando', finalizadaEm: null, vigente: true })),
    ).toBe(true)
  })

  it('leitura de arquivo aponta o arquivo; revisão manual não', async () => {
    const doc = await criarDocumento()
    const arquivo = await criarArquivo(doc)
    const outroDoc = await criarDocumento()
    await criarExtracao(doc.id, null, { metodo: 'manual' })
    expect(await recusado(criarExtracao(doc.id, null))).toBe(true)
    // Extração não lê arquivo de outro documento.
    expect(await recusado(criarExtracao(outroDoc.id, arquivo.id))).toBe(true)
    expect(await recusado(criarExtracao(doc.id, arquivo.id, { metodo: 'ocr', confianca: '1.5' }))).toBe(true)
  })

  it('partes guardam CNPJ alfanumérico e recusam identificação malformada', async () => {
    const doc = await criarDocumento()
    const extracao = await criarExtracao(doc.id, (await criarArquivo(doc)).id)
    const parte = (papel: string, tipoIdentificacao: string | null, identificacao: string | null, sequencia = 1) =>
      db.insert(documentosFiscaisPartes).values({ extracaoId: extracao.id, papel, tipoIdentificacao, identificacao, sequencia })

    await parte('emitente', 'cnpj', '12ABC34501DE35')
    await parte('destinatario', 'cnpj', '12345678000195')
    await parte('autorizado', 'cpf', '12345678901')
    await parte('autorizado', 'estrangeiro', 'X-99/2026', 2)
    await parte('transportador', null, null)

    expect(await recusado(parte('outro', 'cnpj', '12ABC34501DEAB'))).toBe(true)
    expect(await recusado(parte('outro', 'cnpj', '12.345.678/0001-95'))).toBe(true)
    expect(await recusado(parte('outro', 'cpf', '1234567890A'))).toBe(true)
    expect(await recusado(parte('outro', 'cnpj', null))).toBe(true)
    expect(await recusado(parte('emitente', 'cnpj', '12345678000195'))).toBe(true)
  })

  it('tributo é linha com código: IBS, CBS e tributo futuro entram sem migration', async () => {
    const doc = await criarDocumento()
    const arquivo = await criarArquivo(doc)
    const extracao = await criarExtracao(doc.id, arquivo.id)
    const outra = await criarExtracao(doc.id, arquivo.id)
    const [item] = await db
      .insert(documentosFiscaisItens)
      .values({ extracaoId: extracao.id, numeroItem: 1, ncm: '22030000', cfop: '5102', quantidade: '2.5000', valorUnitario: '10.1234567890', valorTotal: '25.31' })
      .returning({ id: documentosFiscaisItens.id })

    for (const tributo of ['icms', 'ibs', 'cbs', 'is', 'tributo_que_ainda_nao_existe']) {
      await db.insert(documentosFiscaisTributos).values({
        extracaoId: extracao.id,
        itemId: item.id,
        tributo,
        classificacaoTributaria: '000001',
        baseCalculo: '25.31',
        aliquotaPercentual: '8.8000',
        valor: '2.23',
        dadosEspecificos: { reducaoBasePercentual: '0.0000' },
      })
    }
    // Tributo do documento inteiro (sem item).
    await db.insert(documentosFiscaisTributos).values({ extracaoId: extracao.id, tributo: 'iss', retido: true, valor: '1.00' })

    expect(await recusado(db.insert(documentosFiscaisTributos).values({ extracaoId: extracao.id, tributo: 'ICMS' }))).toBe(true)
    // Item de uma extração não recebe tributo de outra.
    expect(await recusado(db.insert(documentosFiscaisTributos).values({ extracaoId: outra.id, itemId: item.id, tributo: 'icms' }))).toBe(true)
    expect(
      await recusado(db.insert(documentosFiscaisItens).values({ extracaoId: extracao.id, numeroItem: 1 })),
    ).toBe(true)

    // Precisão do leiaute preservada.
    const [lido] = await db
      .select({ valorUnitario: documentosFiscaisItens.valorUnitario, quantidade: documentosFiscaisItens.quantidade })
      .from(documentosFiscaisItens)
      .where(eq(documentosFiscaisItens.id, item.id))
    expect(lido).toEqual({ valorUnitario: '10.1234567890', quantidade: '2.5000' })

    // As relações do Drizzle navegam do documento aos tributos do item.
    const completo = await db.query.documentosFiscais.findFirst({
      where: eq(documentosFiscais.id, doc.id),
      with: {
        empresa: { columns: { id: true } },
        arquivos: { columns: { id: true } },
        eventos: { columns: { id: true } },
        extracoes: { with: { itens: { with: { tributos: true } }, partes: true, tributos: true } },
      },
    })
    expect(completo?.empresa.id).toBe(cenario.empresaId)
    const comItens = completo?.extracoes.find((e) => e.id === extracao.id)
    expect(comItens?.itens[0].tributos).toHaveLength(5)
    expect(comItens?.tributos).toHaveLength(6)
  })

  it('apagar a extração leva os derivados junto, e o arquivo original fica', async () => {
    const doc = await criarDocumento()
    const arquivo = await criarArquivo(doc)
    const extracao = await criarExtracao(doc.id, arquivo.id)
    await db.insert(documentosFiscaisItens).values({ extracaoId: extracao.id, numeroItem: 1 })
    await db.delete(documentosFiscaisExtracoes).where(eq(documentosFiscaisExtracoes.id, extracao.id))

    const itens = await db.select().from(documentosFiscaisItens).where(eq(documentosFiscaisItens.extracaoId, extracao.id))
    const arquivos = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.id, arquivo.id))
    expect(itens).toHaveLength(0)
    expect(arquivos).toHaveLength(1)
  })
})

describe('permissões no RBAC', () => {
  it('a migration registra exatamente as permissões e vínculos do domínio', () => {
    const nomes = [...MIGRATION.matchAll(/\('(documentos_fiscais\.[a-z]+)', '[^']+'\)/g)].map(([, n]) => n).sort()
    expect(nomes).toEqual(Object.values(P).sort())

    const pares = [...MIGRATION.matchAll(/\('([a-z_]+)', '(documentos_fiscais\.[a-z]+)'\)/g)].map(([, perfil, p]) => `${perfil}→${p}`).sort()
    const esperados = Object.entries(PERMISSOES_FISCAIS_POR_PERFIL)
      .flatMap(([perfil, lista]) => lista.map((p) => `${perfil}→${p}`))
      .sort()
    expect(pares).toEqual(esperados)
  })

  it('as permissões existem no banco e a carga é idempotente', async () => {
    const gravadas = await db.select({ nome: permissoes.nome }).from(permissoes).where(like(permissoes.nome, 'documentos_fiscais.%'))
    expect(gravadas.map(({ nome }) => nome).sort()).toEqual(Object.values(P).sort())

    const antes = (await db.select().from(perfisPermissoes)).length
    for (const comando of MIGRATION.split('--> statement-breakpoint').map((t) => t.trim()).filter((t) => t.startsWith('INSERT INTO'))) {
      await db.execute(sql.raw(comando))
    }
    expect((await db.select().from(perfisPermissoes)).length).toBe(antes)
  })

  it('cada perfil recebe só o que lhe cabe; cliente e advogado, nada', async () => {
    const fiscaisDoPerfil = async (nome: string) => {
      const linhas = await db
        .select({ permissao: permissoes.nome })
        .from(perfisPermissoes)
        .innerJoin(perfis, eq(perfis.id, perfisPermissoes.perfilId))
        .innerJoin(permissoes, eq(permissoes.id, perfisPermissoes.permissaoId))
        .where(and(eq(perfis.nome, nome), like(permissoes.nome, 'documentos_fiscais.%')))
      return linhas.map(({ permissao }) => permissao).sort()
    }
    expect(await fiscaisDoPerfil('profissional')).toEqual(Object.values(P).sort())
    expect(await fiscaisDoPerfil('contador')).toEqual(Object.values(P).sort())
    expect(await fiscaisDoPerfil('colaborador')).toEqual([P.baixar, P.enviar, P.visualizar].sort())
    expect(await fiscaisDoPerfil('cliente')).toEqual([])
    expect(await fiscaisDoPerfil('advogado')).toEqual([])
    expect(await fiscaisDoPerfil('gestor_vincis')).toEqual([])
  })

  it('a carga não concede nada além de permissão fiscal', async () => {
    expect(vinculosFiscaisCriados.length).toBeGreaterThan(0)
    const concedidas = await db
      .select({ nome: permissoes.nome })
      .from(permissoes)
      .where(inArray(permissoes.id, vinculosFiscaisCriados.map((v) => v.permissaoId)))
    expect(concedidas.every(({ nome }) => nome.startsWith('documentos_fiscais.'))).toBe(true)

    const doColaborador = (await buscarPermissoesUsuario(cenario.ids.colaboradorMembro)).map(({ nome }) => nome)
    expect(doColaborador.sort()).toEqual([P.baixar, P.enviar, P.visualizar].sort())
  })
})

describe('isolamento por escritório', () => {
  const acesso = (persona: Persona, permissao = P.visualizar as (typeof P)[keyof typeof P], empresaId = cenario.empresaId) =>
    resolverAcessoDocumentosFiscais(cenario.ids[persona], permissao, empresaId)

  it('membros ativos entram na Central do próprio escritório; quem administra vê tudo', async () => {
    for (const persona of ['proprietario', 'adminProfissional', 'adminColaborador'] as const) {
      const resultado = await acesso(persona)
      expect(resultado?.empresaId, persona).toBe(cenario.empresaId)
      expect(resultado?.administra, persona).toBe(true)
    }
    for (const persona of ['profissionalMembro', 'colaboradorMembro'] as const) {
      const resultado = await acesso(persona)
      expect(resultado?.empresaId, persona).toBe(cenario.empresaId)
      expect(resultado?.administra, persona).toBe(false)
    }
  })

  it('sem vínculo não há acesso — nem com a permissão, nem sendo Gestor', async () => {
    for (const persona of ['estranho', 'profissionalSozinho', 'colaboradorSozinho', 'colaboradorExterno', 'gestor', 'gestorProfissional'] as const) {
      expect(await acesso(persona), persona).toBeNull()
    }
    // O Gestor que é Profissional entra no próprio escritório, e só nele.
    expect((await acesso('gestorProfissional', P.visualizar, cenario.empresaGestorId))?.empresaId).toBe(cenario.empresaGestorId)
    expect(await acesso('proprietario', P.visualizar, cenario.empresaGestorId)).toBeNull()
    expect(await acesso('proprietario', P.visualizar, crypto.randomUUID())).toBeNull()
  })

  it('a permissão do perfil e o papel no escritório são exigidos juntos', async () => {
    // Colaborador não revisa, nem sendo Administrador.
    expect(await acesso('adminColaborador', P.revisar)).toBeNull()
    expect(await acesso('adminColaborador', P.excluir)).toBeNull()
    // Profissional exclui só se administra o escritório.
    expect(await acesso('adminProfissional', P.excluir)).not.toBeNull()
    expect(await acesso('profissionalMembro', P.excluir)).toBeNull()
    expect(await acesso('profissionalMembro', P.integracoes)).toBeNull()
    expect(await acesso('profissionalMembro', P.revisar)).not.toBeNull()
  })

  it('lista e detalhe concordam, documento a documento', async () => {
    await limparFiscal()
    const docs = {
      clienteA: await criarDocumento({ clienteId: cenario.clienteA }),
      clienteB: await criarDocumento({ clienteId: cenario.clienteB }),
      escritorio: await criarDocumento(),
      outroEscritorio: await criarDocumento({ empresaId: cenario.empresaGestorId }),
    }

    const esperado: Partial<Record<Persona, (keyof typeof docs)[]>> = {
      proprietario: ['clienteA', 'clienteB', 'escritorio'],
      adminProfissional: ['clienteA', 'clienteB', 'escritorio'],
      // Atribuído ao cliente A: vê o que é do cliente A, e só.
      profissionalMembro: ['clienteA'],
      colaboradorMembro: ['clienteA'],
      estranho: [],
      gestor: [],
      colaboradorExterno: [],
    }

    for (const [persona, visiveis] of Object.entries(esperado) as [Persona, (keyof typeof docs)[]][]) {
      const noDetalhe = []
      for (const [rotulo, doc] of Object.entries(docs) as [keyof typeof docs, { id: string }][]) {
        if (await resolverAcessoDocumentoFiscal(cenario.ids[persona], P.visualizar, doc.id)) noDetalhe.push(rotulo)
      }
      expect(noDetalhe.sort(), `detalhe: ${persona}`).toEqual([...visiveis].sort())

      const contexto = await resolverAcessoDocumentosFiscais(cenario.ids[persona], P.visualizar, cenario.empresaId)
      const naLista = contexto
        ? (await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(condicaoEscopoDocumentosFiscais(contexto))).map(({ id }) => id)
        : []
      const rotulosLista = (Object.entries(docs) as [keyof typeof docs, { id: string }][])
        .filter(([, doc]) => naLista.includes(doc.id))
        .map(([rotulo]) => rotulo)
      expect(rotulosLista.sort(), `lista: ${persona}`).toEqual([...visiveis].sort())
    }

    expect(await resolverAcessoDocumentoFiscal(cenario.ids.proprietario, P.visualizar, crypto.randomUUID())).toBeNull()
  })
})

describe('cliente do documento pertence ao escritório', () => {
  it('usa o escopo real de clientes, e não só clientes.empresa_id', async () => {
    // Cliente cadastrado por membro comum: `clientes.empresa_id` fica nulo,
    // porque é copiado de `usuarios.empresa_id`, que só o Proprietário tem.
    const [doMembro] = await db
      .insert(clientes)
      .values({
        profissionalId: cenario.ids.profissionalMembro,
        empresaId: null,
        nome: 'Cliente do Membro Fiscal',
        email: 'cliente.membro.fiscal@matriz.teste',
        telefone: '11988887777',
        area: 'contabil',
      })
      .returning({ id: clientes.id })

    expect(await clienteNoEscopoDoEscritorio(cenario.clienteA, cenario.empresaId)).toBe(true)
    expect(await clienteNoEscopoDoEscritorio(doMembro.id, cenario.empresaId)).toBe(true)
    // Cliente de profissional fora do escritório, com `empresa_id` nulo: recusado.
    expect(await clienteNoEscopoDoEscritorio(cenario.clienteSozinho, cenario.empresaId)).toBe(false)
    expect(await clienteNoEscopoDoEscritorio(cenario.clienteColaboradorSozinho, cenario.empresaId)).toBe(false)
    // Cliente do Alfa não entra em outro escritório.
    expect(await clienteNoEscopoDoEscritorio(cenario.clienteA, cenario.empresaGestorId)).toBe(false)
    expect(await clienteNoEscopoDoEscritorio(crypto.randomUUID(), cenario.empresaId)).toBe(false)

    await db.delete(clientes).where(eq(clientes.id, doMembro.id))
  })
})

describe('auditoria fiscal', () => {
  it('metadados só levam campos permitidos — nunca XML, chave ou identificação', () => {
    const entrada = {
      tipoDocumento: 'nfe',
      origem: 'envio_usuario',
      tamanhoBytes: 2048,
      camposAlterados: ['numero'],
      xml: '<nfeProc>…</nfeProc>',
      chaveAcesso: CHAVE_A,
      emitenteIdentificacao: '12345678000195',
      valorTotal: '100.00',
    }
    expect(metadadosAuditoriaFiscal(entrada as never)).toEqual({
      tipoDocumento: 'nfe',
      origem: 'envio_usuario',
      tamanhoBytes: 2048,
      camposAlterados: ['numero'],
    })
  })
})
