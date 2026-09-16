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
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '@/features/documentos-fiscais/constants/permissoes'
import {
  dividirEmLotesDeUpload,
  QUANTIDADE_MAXIMA_LOTE_XML_FISCAL,
  TAMANHO_MAXIMO_LOTE_XML_FISCAL,
} from '@/features/documentos-fiscais/constants/upload'
import { perfilVeDocumentosFiscais, ROTA_DOCUMENTOS_FISCAIS } from '@/features/documentos-fiscais/constants/rotas'
import { resolverAcessoDocumentosFiscais } from '@/features/documentos-fiscais/lib/acesso-documentos-fiscais'
import {
  DOCUMENTOS_FISCAIS_POR_PAGINA,
  listarContribuintesComDocumentos,
  listarDocumentosFiscais,
  type FiltrosDocumentosFiscais,
} from '@/features/documentos-fiscais/queries/listar-documentos-fiscais'
import {
  lerFiltrosDocumentosFiscais,
  montarBuscaDocumentosFiscais,
} from '@/features/documentos-fiscais/schemas/filtros-documentos-fiscais'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'

/*
  Fase 1.7 — Central Fiscal: escopo da listagem, filtros, paginação, resumo e
  visibilidade das ações. Só o armazenamento é simulado.
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

const lerFixture = (nome: string) => readFileSync(path.join(FIXTURES, nome), 'utf8')

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

/** NF-e da fixture com chave, número e data de emissão próprios. */
function nfe({ numero, emissao }: { numero: number; emissao: string }) {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  return lerFixture('nfe-proc-completa.xml')
    .replaceAll(CHAVE_FIXTURE, chave)
    .replace('<nNF>1</nNF>', `<nNF>${numero}</nNF>`)
    .replace('<dhEmi>2026-09-15T10:20:30-03:00</dhEmi>', `<dhEmi>${emissao}T10:20:30-03:00</dhEmi>`)
}

async function importar(xml: string, clienteId: string | null, persona: keyof Cenario['ids'] = 'proprietario', empresaId = cenario.empresaId) {
  const resultado = await receberXmlsFiscais({
    usuarioId: cenario.ids[persona],
    empresaId,
    clienteId,
    arquivos: [new File([xml], `nfe-${sequencia}.xml`, { type: 'application/xml' })],
  })
  if (!resultado.sucesso) throw new Error(`lote recusado: ${resultado.codigo}`)
  return resultado.arquivos[0]
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

const listar = async (persona: keyof Cenario['ids'], filtros: Partial<FiltrosDocumentosFiscais> = {}, empresaId = cenario.empresaId) =>
  listarDocumentosFiscais(await acessoDe(persona, empresaId), { ...FILTROS_VAZIOS, ...filtros })

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

  // Cliente A tem identidade fiscal (notas classificadas); Cliente B não tem.
  await db
    .update(clientes)
    .set({ identificacaoFiscal: CNPJ_EMITENTE, tipoIdentificacaoFiscal: 'cnpj' })
    .where(eq(clientes.id, cenario.clienteA))
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

describe('escopo e isolamento da listagem', () => {
  it('lista vazia enquanto nada foi importado', async () => {
    const vazia = await listar('proprietario')
    expect(vazia.documentos).toEqual([])
    expect(vazia.resumo).toEqual({
      total: 0,
      emitidas: 0,
      recebidas: 0,
      naoDeterminadas: 0,
      comFalha: 0,
      pendentesRevisao: 0,
    })
    expect(vazia.totalPaginas).toBe(1)
  })

  it('cada escritório enxerga só os seus documentos', async () => {
    const doAlfa = await importar(nfe({ numero: 100, emissao: '2026-08-01' }), cenario.clienteA)
    const doGestor = await importar(nfe({ numero: 200, emissao: '2026-08-02' }), null, 'gestorProfissional', cenario.empresaGestorId)

    const alfa = await listar('proprietario')
    const gestor = await listar('gestorProfissional', {}, cenario.empresaGestorId)
    expect(alfa.documentos.map((d) => d.id)).toContain(doAlfa.codigo === 'ACEITO' ? doAlfa.documentoId : '')
    expect(alfa.documentos.map((d) => d.id)).not.toContain(doGestor.codigo === 'ACEITO' ? doGestor.documentoId : '')
    expect(gestor.documentos.map((d) => d.id)).not.toContain(doAlfa.codigo === 'ACEITO' ? doAlfa.documentoId : '')
  })

  it('membro comum vê só documentos dos clientes a que tem acesso', async () => {
    const doClienteA = await importar(nfe({ numero: 101, emissao: '2026-08-03' }), cenario.clienteA)
    const doClienteB = await importar(nfe({ numero: 102, emissao: '2026-08-04' }), cenario.clienteB)
    const doEscritorio = await importar(nfe({ numero: 103, emissao: '2026-08-05' }), null)
    if (doClienteA.codigo !== 'ACEITO' || doClienteB.codigo !== 'ACEITO' || doEscritorio.codigo !== 'ACEITO') {
      throw new Error('esperava aceitos')
    }

    const membro = await listar('profissionalMembro')
    const ids = membro.documentos.map((d) => d.id)
    // O membro é atribuído ao Cliente A, e só a ele.
    expect(ids).toContain(doClienteA.documentoId)
    expect(ids).not.toContain(doClienteB.documentoId)
    expect(ids).not.toContain(doEscritorio.documentoId)
    // O resumo obedece ao mesmo escopo.
    expect(membro.resumo.total).toBe(ids.length)

    const administrador = await listar('proprietario')
    expect(administrador.documentos.map((d) => d.id)).toEqual(
      expect.arrayContaining([doClienteA.documentoId, doClienteB.documentoId, doEscritorio.documentoId]),
    )
  })

  it('o filtro de contribuinte só lista quem a pessoa enxerga', async () => {
    const doProprietario = await listarContribuintesComDocumentos(await acessoDe('proprietario'))
    expect(doProprietario.map((c) => c.nome ?? 'Escritório')).toEqual(
      expect.arrayContaining(['Cliente A', 'Cliente B', 'Escritório']),
    )
    const doMembro = await listarContribuintesComDocumentos(await acessoDe('profissionalMembro'))
    expect(doMembro.map((c) => c.nome)).toEqual(['Cliente A'])
  })
})

describe('ordenação, paginação e conteúdo da linha', () => {
  it('ordena por emissão decrescente e mostra o documento sem data, em vez de escondê-lo', async () => {
    const semInterpretacao = await importar(lerFixture('nfe-versao-nao-suportada.xml'), cenario.clienteA)
    expect(semInterpretacao.codigo).toBe('DOCUMENTO_NAO_INTERPRETADO')

    const lista = await listar('proprietario')
    const datas = lista.documentos.map((d) => d.dataEmissao)
    const comData = datas.filter((data): data is string => data !== null)
    expect([...comData].sort((a, b) => b.localeCompare(a))).toEqual(comData)
    // O não interpretado tem emissão nula e vai para o fim — mas aparece.
    expect(lista.documentos.map((d) => d.id)).toContain(
      semInterpretacao.codigo === 'DOCUMENTO_NAO_INTERPRETADO' ? semInterpretacao.documentoId : '',
    )
    expect(datas[datas.length - 1]).toBeNull()
  })

  it('a linha traz o que a tabela precisa — e o arquivo para baixar', async () => {
    const importado = await importar(nfe({ numero: 300, emissao: '2026-09-10' }), cenario.clienteA)
    if (importado.codigo !== 'ACEITO') throw new Error('esperava aceito')
    const lista = await listar('proprietario', { busca: '300' })
    const linha = lista.documentos.find((d) => d.id === importado.documentoId)!
    expect(linha).toMatchObject({
      tipo: 'nfe',
      numero: '300',
      serie: '1',
      dataEmissao: '2026-09-10',
      clienteNome: 'Cliente A',
      emitenteIdentificacao: CNPJ_EMITENTE,
      sentido: 'emitido',
      statusProcessamento: 'processado',
      statusRevisao: 'pendente',
      situacao: 'nao_verificada',
      contribuinteSemIdentidade: false,
    })
    expect(linha.arquivoId).toEqual(expect.any(String))
    expect(linha.valorTotal).toBe('376.01')
    // A listagem não carrega XML, itens nem tributos.
    expect(Object.keys(linha)).not.toContain('itens')
    expect(JSON.stringify(linha)).not.toContain('documentos-fiscais/')
  })

  it('pagina no banco, com total e páginas coerentes', async () => {
    const acesso = await acessoDe('proprietario')
    const completa = await listarDocumentosFiscais(acesso, FILTROS_VAZIOS)
    expect(completa.documentos.length).toBeLessThanOrEqual(DOCUMENTOS_FISCAIS_POR_PAGINA)
    expect(completa.totalPaginas).toBe(Math.max(1, Math.ceil(completa.resumo.total / DOCUMENTOS_FISCAIS_POR_PAGINA)))

    // Uma página além do fim vem vazia, sem quebrar.
    const alem = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, pagina: completa.totalPaginas + 5 })
    expect(alem.documentos).toEqual([])
    expect(alem.resumo.total).toBe(completa.resumo.total)
  })
})

describe('filtros, busca e resumo', () => {
  it('sentido, processamento e contribuinte estreitam lista e resumo juntos', async () => {
    const acesso = await acessoDe('proprietario')
    const emitidas = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, sentido: 'emitido' })
    expect(emitidas.documentos.every((d) => d.sentido === 'emitido')).toBe(true)
    expect(emitidas.resumo.total).toBe(emitidas.resumo.emitidas)
    expect(emitidas.resumo.recebidas).toBe(0)

    // `nao_determinado` alcança também o documento ainda não interpretado.
    const naoDeterminadas = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, sentido: 'nao_determinado' })
    expect(naoDeterminadas.documentos.every((d) => d.sentido === null || d.sentido === 'nao_determinado')).toBe(true)
    expect(naoDeterminadas.resumo.total).toBe(naoDeterminadas.resumo.naoDeterminadas)

    const comFalha = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, processamento: 'falhou' })
    expect(comFalha.documentos.every((d) => d.statusProcessamento === 'falhou')).toBe(true)
    expect(comFalha.resumo.comFalha).toBe(comFalha.resumo.total)

    const doEscritorio = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, clienteId: 'sem_cliente' })
    expect(doEscritorio.documentos.every((d) => d.clienteId === null)).toBe(true)

    const doClienteB = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, clienteId: cenario.clienteB })
    expect(doClienteB.documentos.every((d) => d.clienteId === cenario.clienteB)).toBe(true)
    // Cliente B não tem CPF/CNPJ cadastrado: a tela usa isso para orientar.
    expect(doClienteB.documentos.every((d) => d.contribuinteSemIdentidade)).toBe(true)
    expect(doClienteB.documentos.every((d) => d.sentido === 'nao_determinado')).toBe(true)
  })

  it('período filtra pela data de emissão', async () => {
    const acesso = await acessoDe('proprietario')
    const agosto = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, de: '2026-08-01', ate: '2026-08-31' })
    expect(agosto.documentos.length).toBeGreaterThan(0)
    expect(agosto.documentos.every((d) => d.dataEmissao! >= '2026-08-01' && d.dataEmissao! <= '2026-08-31')).toBe(true)
    const janeiro = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, de: '2026-01-01', ate: '2026-01-31' })
    expect(janeiro.documentos).toEqual([])
  })

  it('busca por número, nome, CPF/CNPJ com máscara e fim da chave', async () => {
    const acesso = await acessoDe('proprietario')
    const porNumero = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, busca: '300' })
    expect(porNumero.documentos.map((d) => d.numero)).toContain('300')

    const porNome = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, busca: 'Distribuidora' })
    expect(porNome.documentos.length).toBeGreaterThan(0)
    expect(porNome.documentos.every((d) => (d.destinatarioNome ?? '').includes('Distribuidora'))).toBe(true)

    const mascarado = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, busca: '12.345.678/0001-95' })
    expect(mascarado.documentos.length).toBeGreaterThan(0)
    expect(mascarado.documentos.every((d) => d.emitenteIdentificacao === CNPJ_EMITENTE)).toBe(true)

    const [algum] = porNumero.documentos
    const porChave = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, busca: algum.chaveAcesso!.slice(-8) })
    expect(porChave.documentos.map((d) => d.id)).toContain(algum.id)

    const semResultado = await listarDocumentosFiscais(acesso, { ...FILTROS_VAZIOS, busca: 'texto-que-nao-existe' })
    expect(semResultado.documentos).toEqual([])
    expect(semResultado.resumo.total).toBe(0)
  })

  it('filtro fora do escopo não amplia o que a pessoa vê', async () => {
    // Membro comum pedindo explicitamente o Cliente B, ao qual não tem acesso.
    const membro = await listar('profissionalMembro', { clienteId: cenario.clienteB })
    expect(membro.documentos).toEqual([])
    expect(membro.resumo.total).toBe(0)
  })
})

describe('filtros da URL', () => {
  it('lê o que é válido e ignora o resto, sem quebrar a tela', () => {
    expect(
      lerFiltrosDocumentosFiscais({
        pagina: '3',
        sentido: 'emitido',
        processamento: 'falhou',
        revisao: 'pendente',
        de: '2026-08-01',
        ate: '2026-08-31',
        busca: '  nota 300  ',
        cliente: 'sem_cliente',
      }),
    ).toEqual({
      pagina: 3,
      sentido: 'emitido',
      processamento: 'falhou',
      revisao: 'pendente',
      de: '2026-08-01',
      ate: '2026-08-31',
      busca: 'nota 300',
      cliente: 'sem_cliente',
      atencao: false,
      ordem: null,
    })

    expect(
      lerFiltrosDocumentosFiscais({ pagina: '-2', sentido: 'inventado', de: '31/08/2026', cliente: 'nao-e-uuid', busca: '   ' }),
    ).toEqual({
      pagina: 1,
      sentido: null,
      processamento: null,
      revisao: null,
      de: null,
      ate: null,
      busca: null,
      cliente: null,
      atencao: false,
      ordem: null,
    })
  })

  it('monta a URL sem parâmetro vazio e sem página 1', () => {
    expect(montarBuscaDocumentosFiscais({ pagina: 1, sentido: null, busca: '' })).toBe('')
    expect(montarBuscaDocumentosFiscais({ pagina: 2, sentido: 'recebido' })).toBe('?pagina=2&sentido=recebido')
  })
})

describe('ações e menu por permissão', () => {
  it('cada permissão é resolvida no servidor, por pessoa', async () => {
    const permissoes = async (persona: keyof Cenario['ids']) => ({
      visualizar: Boolean(await resolverAcessoDocumentosFiscais(cenario.ids[persona], PERMISSOES_DOCUMENTOS_FISCAIS.visualizar, cenario.empresaId)),
      enviar: Boolean(await resolverAcessoDocumentosFiscais(cenario.ids[persona], PERMISSOES_DOCUMENTOS_FISCAIS.enviar, cenario.empresaId)),
      revisar: Boolean(await resolverAcessoDocumentosFiscais(cenario.ids[persona], PERMISSOES_DOCUMENTOS_FISCAIS.revisar, cenario.empresaId)),
      baixar: Boolean(await resolverAcessoDocumentosFiscais(cenario.ids[persona], PERMISSOES_DOCUMENTOS_FISCAIS.baixar, cenario.empresaId)),
    })

    expect(await permissoes('proprietario')).toEqual({ visualizar: true, enviar: true, revisar: true, baixar: true })
    // Colaborador envia e baixa, mas não reprocessa: o botão não aparece.
    expect(await permissoes('colaboradorMembro')).toMatchObject({ visualizar: true, enviar: true, revisar: false, baixar: true })
    // De fora do escritório, nada.
    expect(await permissoes('estranho')).toEqual({ visualizar: false, enviar: false, revisar: false, baixar: false })
    expect(await permissoes('gestorProfissional')).toEqual({ visualizar: false, enviar: false, revisar: false, baixar: false })
  })

  it('o menu segue a mesma tabela de permissões por perfil', () => {
    expect(ROTA_DOCUMENTOS_FISCAIS).toBe('/admin/documentos-fiscais')
    expect(perfilVeDocumentosFiscais('profissional')).toBe(true)
    expect(perfilVeDocumentosFiscais('contador')).toBe(true)
    expect(perfilVeDocumentosFiscais('colaborador')).toBe(true)
    expect(perfilVeDocumentosFiscais('advogado')).toBe(false)
    expect(perfilVeDocumentosFiscais('cliente')).toBe(false)
    expect(perfilVeDocumentosFiscais(null)).toBe(false)
  })
})

describe('envio em lotes pela tela', () => {
  it('a seleção grande é dividida usando os limites do servidor', () => {
    const pequenos = Array.from({ length: 120 }, () => ({ size: 10_000 }))
    const lotes = dividirEmLotesDeUpload(pequenos)
    expect(lotes.flat()).toHaveLength(120)
    expect(lotes.every((lote) => lote.length <= QUANTIDADE_MAXIMA_LOTE_XML_FISCAL)).toBe(true)
    expect(
      lotes.every((lote) => lote.reduce((soma, a) => soma + a.size, 0) <= TAMANHO_MAXIMO_LOTE_XML_FISCAL),
    ).toBe(true)
    expect(lotes).toHaveLength(3)

    // Poucos arquivos pesados também se dividem pela soma de bytes.
    const pesados = Array.from({ length: 4 }, () => ({ size: 1024 * 1024 }))
    expect(dividirEmLotesDeUpload(pesados).length).toBeGreaterThan(1)
    expect(dividirEmLotesDeUpload([])).toEqual([])
  })
})
