import { createHash } from 'node:crypto'
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
  empresaMembros,
  eventosAuditoria,
  perfisPermissoes,
} from '@/db/schema'
import {
  excedeLimitesDoLote,
  FOLGA_ENVELOPE_LOTE,
  LIMITE_CORPO_PLATAFORMA,
  MENSAGENS_UPLOAD_FISCAL,
  QUANTIDADE_MAXIMA_LOTE_XML_FISCAL,
  TAMANHO_MAXIMO_LOTE_XML_FISCAL,
  TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL,
  TAMANHO_MAXIMO_XML_FISCAL,
} from '@/features/documentos-fiscais/constants/upload'
import { COOKIE_EMPRESA_ATIVA } from '@/features/empresas/lib/contexto-empresa-cookie'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { limparCenario, montarCenario, type Cenario, type Persona } from './setup/personas'
import { definirCookie, entrarComo, limparCookies, sairDaSessao } from './setup/sessao'

/*
  Fase 1.2 — upload seguro de XML fiscal.

  O armazenamento é o único ponto simulado: um fake em memória com a mesma
  política do Vercel Blob privado (sem sobrescrita). Autorização, validação,
  banco, índice de duplicidade e auditoria rodam de verdade. Todos os XMLs são
  sintéticos.
*/

const armazenamento = vi.hoisted(() => ({
  objetos: new Map<string, Uint8Array>(),
  falharGravacao: false,
  aoGravar: null as null | ((chave: string) => Promise<void>),
}))

vi.mock('@/features/documentos-fiscais/lib/armazenamento-fiscal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/documentos-fiscais/lib/armazenamento-fiscal')>()
  return {
    montarChaveOriginal: original.montarChaveOriginal,
    gravarOriginalPrivado: async (chave: string, bytes: Uint8Array) => {
      if (armazenamento.falharGravacao) throw new Error('storage indisponível')
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
const { validarXmlFiscal, calcularSha256 } = await import('@/features/documentos-fiscais/lib/validar-xml-fiscal')
const { POST } = await import('@/app/api/documentos-fiscais/xml/route')
const { GET } = await import('@/app/api/documentos-fiscais/[documentoId]/arquivos/[arquivoId]/route')

const SUFIXO = '@upload.fiscal.teste'
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')

let cenario: Cenario
let semPermissao: { id: string; token: string }
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let sequencia = 0

/**
 * NF-e sintética mínima, porém completa o bastante para o parser da Fase 1.3:
 * cada chamada gera chave, número e bytes diferentes.
 */
function xmlNfe(extra = '') {
  sequencia += 1
  const numero = String(sequencia).padStart(9, '0')
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe3526091234567800019555001${numero}1000000010" versao="4.00"><ide><cUF>35</cUF><natOp>Venda &amp; revenda</natOp><mod>55</mod><serie>1</serie><nNF>${sequencia}</nNF><dhEmi>2026-09-15T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb><finNFe>1</finNFe></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Emitente Sintetico</xNome><enderEmit><xLgr>Rua Teste</xLgr><nro>1</nro><xMun>Sao Paulo</xMun><UF>SP</UF></enderEmit><IE>111111111111</IE><CRT>3</CRT></emit><dest><CNPJ>98765432000198</CNPJ><xNome>Destinatario Sintetico</xNome></dest><det nItem="1"><prod><cProd>P-1</cProd><xProd>Produto ${sequencia}</xProd><NCM>09012100</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>10.0000000000</vUnCom><vProd>10.00</vProd><indTot>1</indTot></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>10.00</vBC><pICMS>18.0000</pICMS><vICMS>1.80</vICMS></ICMS00></ICMS></imposto></det><total><ICMSTot><vBC>10.00</vBC><vICMS>1.80</vICMS><vProd>10.00</vProd><vNF>10.00</vNF></ICMSTot></total>${extra}</infNFe></NFe></nfeProc>`
}

/** NF-e sintética válida com exatamente `tamanho` bytes (espaço depois da raiz). */
function xmlComTamanho(tamanho: number) {
  const base = xmlNfe()
  return base + ' '.repeat(tamanho - new TextEncoder().encode(base).byteLength)
}

const arquivo = (conteudo: string | Uint8Array, nome = `nota-${sequencia}.xml`, tipo = 'application/xml') =>
  new File([typeof conteudo === 'string' ? conteudo : conteudo.slice()], nome, { type: tipo })

const bytesDe = (texto: string) => new TextEncoder().encode(texto)

const validar = (conteudo: string | Uint8Array, nome = 'nota.xml', tipoMime = 'application/xml') =>
  validarXmlFiscal({ nome, tipoMime, bytes: typeof conteudo === 'string' ? bytesDe(conteudo) : conteudo })

const enviar = (persona: Persona | { id: string }, arquivos: File[], clienteId: string | null = null, empresaId = cenario.empresaId) =>
  receberXmlsFiscais({
    usuarioId: typeof persona === 'string' ? cenario.ids[persona] : persona.id,
    empresaId,
    clienteId,
    arquivos,
  })

/** O que um lote recusado inteiro não pode ter mudado. */
async function estadoDoUpload() {
  const documentos = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(eq(documentosFiscais.empresaId, cenario.empresaId))
  const eventos = await db.select({ id: eventosAuditoria.id }).from(eventosAuditoria).where(eq(eventosAuditoria.acao, 'documento_fiscal_enviado'))
  return { documentos: documentos.length, eventos: eventos.length, objetos: armazenamento.objetos.size }
}

async function documentosComHash(sha256: string) {
  return db.select().from(documentosFiscais).where(eq(documentosFiscais.sha256Original, sha256))
}

/** Todo objeto no storage precisa ter linha de arquivo: nada órfão. */
async function objetosSemRegistro() {
  const chaves = [...armazenamento.objetos.keys()]
  if (!chaves.length) return []
  const registradas = await db
    .select({ chave: documentosFiscaisArquivos.chaveArmazenamento })
    .from(documentosFiscaisArquivos)
    .where(inArray(documentosFiscaisArquivos.chaveArmazenamento, chaves))
  const conjunto = new Set(registradas.map(({ chave }) => chave))
  return chaves.filter((chave) => !conjunto.has(chave))
}

async function limparFiscal() {
  if (!cenario) return
  const empresas = [cenario.empresaId, cenario.empresaGestorId]
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, empresas))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    // Ordem das FKs: evento → extração (que cascateia partes, itens e tributos)
    // → arquivo → documento.
    // Ordem das FKs: extração → arquivo (que pode apontar para evento) → evento.
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscais).where(inArray(documentosFiscais.id, ids))
  }
  await db.delete(eventosAuditoria).where(and(like(eventosAuditoria.acao, 'documento_fiscal_%'), inArray(eventosAuditoria.empresaId, empresas)))
}

beforeAll(async () => {
  cenario = await montarCenario()

  // Os perfis nascem depois das migrations: aplica-se a carga de permissões da
  // 0066, exatamente como vai para os bancos reais.
  const antes = new Set((await db.select().from(perfisPermissoes)).map((v) => `${v.perfilId}:${v.permissaoId}`))
  for (const comando of MIGRATION_0066.split('--> statement-breakpoint').map((t) => t.trim()).filter((t) => t.startsWith('INSERT INTO'))) {
    await db.execute(sql.raw(comando))
  }
  vinculosCriados = (await db.select().from(perfisPermissoes)).filter((v) => !antes.has(`${v.perfilId}:${v.permissaoId}`))

  // Membro ativo do escritório, mas com perfil sem permissão fiscal nenhuma.
  ;({ semPermissao } = await criarContas(SUFIXO, { semPermissao: { perfil: 'advogado', prestador: 'profissional' } }, '119477'))
  await db.insert(empresaMembros).values({ empresaId: cenario.empresaId, usuarioId: semPermissao.id, funcao: 'profissional', status: 'ativo' })
})

beforeEach(() => {
  armazenamento.falharGravacao = false
  armazenamento.aoGravar = null
})

afterAll(async () => {
  sairDaSessao()
  limparCookies()
  await limparFiscal()
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  if (semPermissao) await db.delete(empresaMembros).where(eq(empresaMembros.usuarioId, semPermissao.id))
  await limparContas(SUFIXO)
  await limparCenario()
})

describe('validação do arquivo', () => {
  it('aceita NF-e mínima (nfeProc e NFe), com BOM e quebras CRLF', () => {
    expect(validar(xmlNfe())).toMatchObject({ valido: true, raiz: 'nfeProc' })
    expect(validar('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe/></NFe>')).toMatchObject({ valido: true, raiz: 'NFe' })
    expect(validar(`\ufeff${xmlNfe().replace(/\n/g, '\r\n')}`, 'NOTA.XML', 'text/xml')).toMatchObject({ valido: true })
    expect(validar(xmlNfe('<!-- comentário --><obs><![CDATA[a < b]]></obs>'), 'nota.xml', '')).toMatchObject({ valido: true })
  })

  it.each([
    ['tag não fechada', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe></nfeProc>'],
    ['fechamento divergente', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><a></b></nfeProc>'],
    ['duas raízes', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/><nfeProc/>'],
    ['atributo sem aspas', '<nfeProc xmlns=http://www.portalfiscal.inf.br/nfe/>'],
    ['atributo repetido', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" a="1" a="2"/>'],
    ['e comercial solto', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">A & B</nfeProc>'],
    ['texto que não é XML', 'isto não é xml'],
    ['texto fora da raiz', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>lixo'],
    ['encoding não UTF-8', '<?xml version="1.0" encoding="ISO-8859-1"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>'],
    ['profundidade abusiva', `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">${'<a>'.repeat(100)}${'</a>'.repeat(100)}</nfeProc>`],
  ])('XML malformado: %s → XML_INVALIDO', (_, conteudo) => {
    expect(validar(conteudo)).toMatchObject({ valido: false, codigo: 'XML_INVALIDO' })
  })

  it('arquivo vazio', () => {
    expect(validar('')).toMatchObject({ valido: false, codigo: 'ARQUIVO_VAZIO' })
  })

  it('extensão falsa ou ausente e MIME inadequado', () => {
    expect(validar(xmlNfe(), 'nota.txt')).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(xmlNfe(), 'nota.xml.exe')).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(xmlNfe(), '.xml')).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(xmlNfe(), 'nota.xml', 'application/pdf')).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(xmlNfe(), 'nota.xml', 'application/x-msdownload')).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
  })

  it('binário renomeado para .xml', () => {
    expect(validar(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(bytesDe('%PDF-1.7\n...'))).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]))).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(new Uint8Array([0x3c, 0x61, 0x00, 0x3e]))).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(new Uint8Array([0x3c, 0xc3, 0x28, 0x3e]))).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
    expect(validar(`<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">\u0007</nfeProc>`)).toMatchObject({ codigo: 'ARQUIVO_NAO_PERMITIDO' })
  })

  it('acima do limite', () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO_XML_FISCAL + 1).fill(0x20)
    expect(validar(grande)).toMatchObject({ codigo: 'ARQUIVO_MUITO_GRANDE' })
  })

  it.each([
    ['DTD externo com XXE de arquivo local', '<?xml version="1.0"?><!DOCTYPE nfeProc [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">&xxe;</nfeProc>'],
    ['entidade externa de rede', '<!DOCTYPE nfeProc SYSTEM "http://169.254.169.254/latest/meta-data"><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>'],
    ['billion laughs', `<!DOCTYPE lolz [<!ENTITY lol "lol">${Array.from({ length: 9 }, (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i || ''};`.repeat(10)}">`).join('')}]><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">&lol9;</nfeProc>`],
    ['DTD depois da declaração, sem entidades', '<?xml version="1.0"?><!DOCTYPE nfeProc><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>'],
    ['entidade nomeada sem DTD', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">&xxe;</nfeProc>'],
    ['entidade em atributo', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" a="&xxe;"/>'],
    ['stylesheet externo', '<?xml version="1.0"?><?xml-stylesheet href="http://evil.test/x.xsl"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"/>'],
    ['DTD dentro do documento', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><!ENTITY x "y"></nfeProc>'],
  ])('%s → XML_INSEGURO, sem resolver nada', (_, conteudo) => {
    const inicio = performance.now()
    expect(validar(conteudo)).toMatchObject({ valido: false, codigo: 'XML_INSEGURO' })
    expect(performance.now() - inicio).toBeLessThan(200)
  })

  it('é barreira de entrada, não parser fiscal: não confere layout nem extrai dado fiscal', () => {
    // Raiz aceita com conteúdo sem sentido fiscal algum: entra, e a interpretação fica para o parser.
    const semLayout = validar('<NFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="9.99"><qualquerCoisa/></NFe>')
    expect(semLayout).toMatchObject({ valido: true, raiz: 'NFe' })
    const completo = validar(xmlNfe('<emit><CNPJ>12ABC34501DE35</CNPJ></emit><total><vNF>10.00</vNF></total>'))
    expect(Object.keys(completo).sort()).toEqual(['nomeOriginal', 'raiz', 'sha256', 'valido'])
  })

  it('XML bem formado que não é NF-e → XML_NAO_SUPORTADO', () => {
    expect(validar('<foo/>')).toMatchObject({ codigo: 'XML_NAO_SUPORTADO' })
    expect(validar('<nfeProc xmlns="http://outro.namespace"/>')).toMatchObject({ codigo: 'XML_NAO_SUPORTADO' })
    expect(validar('<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"/>')).toMatchObject({ codigo: 'XML_NAO_SUPORTADO' })
  })

  it('arquivo grande e válido é verificado em tempo linear', () => {
    const itens = '<det><prod><xProd>Produto &amp; cia</xProd></prod></det>'.repeat(45_000)
    const conteudo = xmlNfe(itens)
    expect(bytesDe(conteudo).byteLength).toBeLessThan(TAMANHO_MAXIMO_XML_FISCAL)
    const inicio = performance.now()
    expect(validar(conteudo)).toMatchObject({ valido: true })
    expect(performance.now() - inicio).toBeLessThan(2000)
  })
})

describe('SHA-256 dos bytes originais', () => {
  it('é estável, igual ao hash dos bytes exatos, e muda com qualquer byte', () => {
    const texto = xmlNfe()
    const bytes = bytesDe(texto)
    const esperado = createHash('sha256').update(bytes).digest('hex')
    expect(calcularSha256(bytes)).toBe(esperado)
    expect(calcularSha256(bytesDe(texto))).toBe(esperado)
    expect(validar(bytes)).toMatchObject({ sha256: esperado })
    // Mesmo XML "equivalente" com CRLF ou BOM é outro arquivo: sem normalização.
    expect(calcularSha256(bytesDe(texto.replace(/\n/g, '\r\n')))).not.toBe(esperado)
    expect(calcularSha256(bytesDe(`\ufeff${texto}`))).not.toBe(esperado)
  })
})

describe('autorização do upload', () => {
  it('membro sem a permissão fiscal é recusado antes de qualquer gravação', async () => {
    const antes = armazenamento.objetos.size
    expect(await enviar(semPermissao, [arquivo(xmlNfe())], cenario.clienteA)).toMatchObject({ sucesso: false, codigo: 'SEM_PERMISSAO' })
    expect(armazenamento.objetos.size).toBe(antes)
  })

  it('quem não é do escritório não envia para ele — nem o Gestor', async () => {
    for (const persona of ['estranho', 'gestor', 'colaboradorExterno', 'profissionalSozinho'] as const) {
      expect(await enviar(persona, [arquivo(xmlNfe())], null), persona).toMatchObject({ codigo: 'SEM_PERMISSAO' })
    }
    // Proprietário do Alfa tentando o escritório do Gestor.
    expect(await enviar('proprietario', [arquivo(xmlNfe())], null, cenario.empresaGestorId)).toMatchObject({ codigo: 'SEM_PERMISSAO' })
  })

  it('cliente fora do escopo recebe a mesma resposta que cliente inexistente', async () => {
    const antes = armazenamento.objetos.size
    expect(await enviar('proprietario', [arquivo(xmlNfe())], cenario.clienteSozinho)).toMatchObject({ codigo: 'CLIENTE_FORA_DO_ESCOPO' })
    expect(await enviar('proprietario', [arquivo(xmlNfe())], crypto.randomUUID())).toMatchObject({ codigo: 'CLIENTE_FORA_DO_ESCOPO' })
    // Gestor-Profissional no próprio escritório, com cliente do Alfa.
    expect(await enviar('gestorProfissional', [arquivo(xmlNfe())], cenario.clienteA, cenario.empresaGestorId)).toMatchObject({ codigo: 'CLIENTE_FORA_DO_ESCOPO' })
    expect(armazenamento.objetos.size).toBe(antes)
  })

  it('membro comum só envia para cliente ao qual tem acesso, e sempre com cliente', async () => {
    expect(await enviar('profissionalMembro', [arquivo(xmlNfe())], cenario.clienteB)).toMatchObject({ codigo: 'CLIENTE_FORA_DO_ESCOPO' })
    expect(await enviar('profissionalMembro', [arquivo(xmlNfe())], null)).toMatchObject({ codigo: 'CLIENTE_OBRIGATORIO' })
    const aceito = await enviar('colaboradorMembro', [arquivo(xmlNfe())], cenario.clienteA)
    expect(aceito).toMatchObject({ sucesso: true, resumo: { aceitos: 1 } })
  })
})

describe('recebimento, metadados e armazenamento privado', () => {
  it('cria o documento da perspectiva certa, com arquivo de bytes exatos e chave privada', async () => {
    const conteudo = xmlNfe()
    const bytes = bytesDe(conteudo)
    const resultado = await enviar('proprietario', [arquivo(conteudo, 'C:\\Users\\x\\NF 123.xml', 'text/xml')], cenario.clienteA)
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    const item = resultado.arquivos[0]
    expect(item.codigo).toBe('ACEITO')
    if (item.codigo !== 'ACEITO') return

    const [doc] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, item.documentoId))
    expect(doc).toMatchObject({
      empresaId: cenario.empresaId,
      clienteId: cenario.clienteA,
      enviadoPorId: cenario.ids.proprietario,
      origem: 'envio_usuario',
      statusRevisao: 'pendente',
      // Interpretar não é conferir com a autoridade fiscal.
      situacao: 'nao_verificada',
      sha256Original: calcularSha256(bytes),
    })

    const [original] = await db.select().from(documentosFiscaisArquivos).where(eq(documentosFiscaisArquivos.id, item.arquivoId))
    expect(original).toMatchObject({
      empresaId: cenario.empresaId,
      documentoFiscalId: doc.id,
      tipoArquivo: 'xml',
      nomeOriginal: 'NF 123.xml',
      tipoMime: 'application/xml',
      tamanhoBytes: bytes.byteLength,
      sha256: calcularSha256(bytes),
    })
    expect(original.chaveArmazenamento).toBe(`documentos-fiscais/${cenario.empresaId}/${doc.id}/${original.id}.xml`)
    expect(original.chaveArmazenamento).not.toMatch(/^https?:/)
    expect(armazenamento.objetos.get(original.chaveArmazenamento)).toEqual(bytes)

    // A resposta não expõe chave de storage.
    expect(JSON.stringify(resultado)).not.toContain('documentos-fiscais/')
  })

  it('falha do storage não deixa documento fantasma', async () => {
    armazenamento.falharGravacao = true
    const conteudo = xmlNfe()
    const resultado = await enviar('proprietario', [arquivo(conteudo)], cenario.clienteA)
    expect(resultado).toMatchObject({ sucesso: true, arquivos: [{ codigo: 'FALHA_ARMAZENAMENTO' }] })
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(0)
  })

  it('falha do banco depois do storage remove o objeto gravado', async () => {
    const antes = armazenamento.objetos.size
    // Ocupa o id que o documento vai usar: a transação falha por outro motivo que não duplicidade.
    armazenamento.aoGravar = async (chave) => {
      const documentoId = chave.split('/')[2]
      await db.insert(documentosFiscais).values({ id: documentoId, empresaId: cenario.empresaId, origem: 'envio_usuario' })
    }
    const conteudo = xmlNfe()
    const resultado = await enviar('proprietario', [arquivo(conteudo)], cenario.clienteA)
    expect(resultado).toMatchObject({ sucesso: true, arquivos: [{ codigo: 'FALHA_REGISTRO' }] })
    expect(armazenamento.objetos.size).toBe(antes)
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(0)
  })
})

describe('duplicidade', () => {
  it('mesmo arquivo + mesmo cliente → ARQUIVO_DUPLICADO com referência, sem nova cópia', async () => {
    const conteudo = xmlNfe()
    const primeiro = await enviar('proprietario', [arquivo(conteudo)], cenario.clienteA)
    const objetos = armazenamento.objetos.size
    const segundo = await enviar('proprietario', [arquivo(conteudo, 'outro-nome.xml')], cenario.clienteA)
    const idPrimeiro = primeiro.sucesso && primeiro.arquivos[0].codigo === 'ACEITO' ? primeiro.arquivos[0].documentoId : 'x'
    expect(segundo).toMatchObject({ sucesso: true, arquivos: [{ codigo: 'ARQUIVO_DUPLICADO', documentoId: idPrimeiro }] })
    expect(armazenamento.objetos.size).toBe(objetos)
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(1)
  })

  it('mesmo arquivo + sem cliente + mesma empresa → ARQUIVO_DUPLICADO', async () => {
    const conteudo = xmlNfe()
    await enviar('proprietario', [arquivo(conteudo)], null)
    expect(await enviar('adminProfissional', [arquivo(conteudo)], null)).toMatchObject({ arquivos: [{ codigo: 'ARQUIVO_DUPLICADO' }] })
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(1)
  })

  it('mesmo arquivo em perspectiva diferente → aceito', async () => {
    const conteudo = xmlNfe()
    expect(await enviar('proprietario', [arquivo(conteudo)], cenario.clienteA)).toMatchObject({ arquivos: [{ codigo: 'ACEITO' }] })
    expect(await enviar('proprietario', [arquivo(conteudo)], cenario.clienteB)).toMatchObject({ arquivos: [{ codigo: 'ACEITO' }] })
    expect(await enviar('proprietario', [arquivo(conteudo)], null)).toMatchObject({ arquivos: [{ codigo: 'ACEITO' }] })
    expect(await enviar('gestorProfissional', [arquivo(conteudo)], null, cenario.empresaGestorId)).toMatchObject({ arquivos: [{ codigo: 'ACEITO' }] })
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(4)
  })

  it('duplicado só aponta o documento existente para quem pode vê-lo', async () => {
    const conteudo = xmlNfe()
    await enviar('proprietario', [arquivo(conteudo)], cenario.clienteA)
    // Colaborador atribuído tem visualizar: recebe a referência.
    const resultado = await enviar('colaboradorMembro', [arquivo(conteudo)], cenario.clienteA)
    expect(resultado).toMatchObject({ arquivos: [{ codigo: 'ARQUIVO_DUPLICADO' }] })
    expect(resultado.sucesso && resultado.arquivos[0].codigo === 'ARQUIVO_DUPLICADO' && resultado.arquivos[0].documentoId).toBeTruthy()
  })

  it('uploads simultâneos do mesmo arquivo não duplicam', async () => {
    const conteudo = xmlNfe()
    const [a, b] = await Promise.all([
      enviar('proprietario', [arquivo(conteudo)], cenario.clienteA),
      enviar('adminProfissional', [arquivo(conteudo)], cenario.clienteA),
    ])
    const codigos = [a, b].map((r) => (r.sucesso ? r.arquivos[0].codigo : r.codigo)).sort()
    expect(codigos).toEqual(['ACEITO', 'ARQUIVO_DUPLICADO'])
    expect(await documentosComHash(calcularSha256(bytesDe(conteudo)))).toHaveLength(1)
    expect(await objetosSemRegistro()).toEqual([])
  })

  it('corrida perdida na transação: o índice recusa, o objeto é descartado e a resposta é duplicado', async () => {
    const conteudo = xmlNfe()
    const sha = calcularSha256(bytesDe(conteudo))
    const antes = armazenamento.objetos.size
    // Outra requisição confirma o mesmo arquivo entre a checagem rápida e a transação.
    armazenamento.aoGravar = async () => {
      await db.insert(documentosFiscais).values({ empresaId: cenario.empresaId, clienteId: null, origem: 'envio_usuario', sha256Original: sha })
    }
    const resultado = await enviar('proprietario', [arquivo(conteudo)], null)
    expect(resultado).toMatchObject({ arquivos: [{ codigo: 'ARQUIVO_DUPLICADO' }] })
    expect(armazenamento.objetos.size).toBe(antes)
    expect(await documentosComHash(sha)).toHaveLength(1)
    expect(await objetosSemRegistro()).toEqual([])
  })

  it('o mesmo arquivo duas vezes no mesmo lote', async () => {
    const conteudo = xmlNfe()
    const resultado = await enviar('proprietario', [arquivo(conteudo, 'a.xml'), arquivo(conteudo, 'b.xml')], cenario.clienteB)
    expect(resultado).toMatchObject({ sucesso: true, resumo: { aceitos: 1, duplicados: 1 } })
  })
})

describe('lote', () => {
  it('mistura de válidos, inválidos e duplicados: cada arquivo com o seu resultado', async () => {
    const repetido = xmlNfe()
    await enviar('proprietario', [arquivo(repetido)], cenario.clienteA)

    const resultado = await enviar(
      'proprietario',
      [
        arquivo(xmlNfe(), 'ok-1.xml'),
        arquivo('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe>', 'quebrado.xml'),
        arquivo(repetido, 'repetido.xml'),
        arquivo(new Uint8Array([0x4d, 0x5a, 0x00]), 'programa.xml', 'application/octet-stream'),
        arquivo('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">&e;</nfeProc>', 'xxe.xml'),
        arquivo('', 'vazio.xml'),
        arquivo(xmlNfe(), 'ok-2.xml'),
      ],
      cenario.clienteA,
    )
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.arquivos.map((r) => [r.indice, r.nome, r.codigo])).toEqual([
      [0, 'ok-1.xml', 'ACEITO'],
      [1, 'quebrado.xml', 'XML_INVALIDO'],
      [2, 'repetido.xml', 'ARQUIVO_DUPLICADO'],
      [3, 'programa.xml', 'ARQUIVO_NAO_PERMITIDO'],
      [4, 'xxe.xml', 'XML_INSEGURO'],
      [5, 'vazio.xml', 'ARQUIVO_VAZIO'],
      [6, 'ok-2.xml', 'ACEITO'],
    ])
    expect(resultado.resumo).toEqual({ total: 7, aceitos: 2, duplicados: 1, naoInterpretados: 0, recusados: 4 })
    for (const item of resultado.arquivos) expect(item.mensagem.length).toBeGreaterThan(0)
  })

  it('arquivo acima do limite é recusado sozinho, sem ser lido', async () => {
    const grande = new File([new Uint8Array(TAMANHO_MAXIMO_XML_FISCAL + 1).fill(0x20)], 'grande.xml', { type: 'application/xml' })
    let lido = false
    const espiao = Object.assign(grande, {
      arrayBuffer: async () => {
        lido = true
        return new ArrayBuffer(0)
      },
    })
    const resultado = await enviar('proprietario', [espiao, arquivo(xmlNfe())], cenario.clienteA)
    expect(resultado).toMatchObject({ resumo: { aceitos: 1, recusados: 1 }, arquivos: [{ codigo: 'ARQUIVO_MUITO_GRANDE' }, { codigo: 'ACEITO' }] })
    expect(lido).toBe(false)
  })

  it('lote vazio', async () => {
    expect(await enviar('proprietario', [], cenario.clienteA)).toMatchObject({ sucesso: false, codigo: 'LOTE_VAZIO' })
  })
})

describe('limite total do lote', () => {
  it('a política é coerente: um lote cheio cabe numa requisição, com folga da plataforma', () => {
    expect(TAMANHO_MAXIMO_XML_FISCAL).toBeLessThanOrEqual(TAMANHO_MAXIMO_LOTE_XML_FISCAL)
    expect(TAMANHO_MAXIMO_LOTE_XML_FISCAL + FOLGA_ENVELOPE_LOTE).toBe(TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL)
    expect(LIMITE_CORPO_PLATAFORMA - TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL).toBeGreaterThanOrEqual(256 * 1024)
    // Nunca a conta enganosa `quantidade × tamanho por arquivo`.
    expect(QUANTIDADE_MAXIMA_LOTE_XML_FISCAL * TAMANHO_MAXIMO_XML_FISCAL).toBeGreaterThan(TAMANHO_MAXIMO_LOTE_XML_FISCAL)
    expect(MENSAGENS_UPLOAD_FISCAL.LOTE_MUITO_GRANDE).toBe(`Envie no máximo ${QUANTIDADE_MAXIMA_LOTE_XML_FISCAL} arquivos e 3,5 MB por vez.`)
    expect(MENSAGENS_UPLOAD_FISCAL.ARQUIVO_MUITO_GRANDE).toBe('O arquivo XML deve ter no máximo 3 MB.')
  })

  it('o envelope multipart do pior lote (50 arquivos, nomes longos) cabe na folga', async () => {
    const formulario = new FormData()
    for (let i = 0; i < QUANTIDADE_MAXIMA_LOTE_XML_FISCAL; i++) {
      formulario.append('arquivos', new File([], `${'ç'.repeat(240)}-${i}.xml`, { type: 'application/xml' }))
    }
    formulario.append('clienteId', crypto.randomUUID())
    const envelope = (await new Request('http://localhost/', { method: 'POST', body: formulario }).arrayBuffer()).byteLength
    expect(envelope).toBeLessThan(FOLGA_ENVELOPE_LOTE / 4)
  })

  it('excedeLimitesDoLote: quantidade e soma real, sem olhar o limite de cada arquivo', () => {
    const de = (...tamanhos: number[]) => tamanhos.map((size) => ({ size }))
    expect(excedeLimitesDoLote(de(TAMANHO_MAXIMO_LOTE_XML_FISCAL))).toBe(false)
    expect(excedeLimitesDoLote(de(TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2, TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2 + 1))).toBe(true)
    expect(excedeLimitesDoLote(de(...Array(QUANTIDADE_MAXIMA_LOTE_XML_FISCAL).fill(10)))).toBe(false)
    expect(excedeLimitesDoLote(de(...Array(QUANTIDADE_MAXIMA_LOTE_XML_FISCAL + 1).fill(10)))).toBe(true)
  })

  it('lote com soma exatamente no limite total → permitido', async () => {
    const metade = TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2
    const arquivos = [arquivo(xmlComTamanho(metade), 'metade-1.xml'), arquivo(xmlComTamanho(metade), 'metade-2.xml')]
    expect(arquivos.reduce((soma, a) => soma + a.size, 0)).toBe(TAMANHO_MAXIMO_LOTE_XML_FISCAL)
    expect(await enviar('proprietario', arquivos, cenario.clienteA)).toMatchObject({ sucesso: true, resumo: { total: 2, aceitos: 2 } })
  })

  it('soma dos arquivos um byte acima do limite → LOTE_MUITO_GRANDE, nada lido, gravado ou auditado', async () => {
    const antes = await estadoDoUpload()
    const metade = TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2
    let lidos = 0
    const espiao = (conteudo: string, nome: string) =>
      Object.assign(arquivo(conteudo, nome), {
        arrayBuffer: async () => {
          lidos += 1
          return new ArrayBuffer(0)
        },
      })
    // Cada arquivo, sozinho, está dentro do limite individual: quem recusa é o lote.
    const arquivos = [espiao(xmlComTamanho(metade), 'a.xml'), espiao(xmlComTamanho(metade + 1), 'b.xml')]
    expect(await enviar('proprietario', arquivos, cenario.clienteA)).toEqual({
      sucesso: false,
      codigo: 'LOTE_MUITO_GRANDE',
      mensagem: MENSAGENS_UPLOAD_FISCAL.LOTE_MUITO_GRANDE,
    })
    expect(lidos).toBe(0)
    expect(await estadoDoUpload()).toEqual(antes)
  })

  it('limite de quantidade continua valendo: 50 entram, 51 recusam o lote inteiro', async () => {
    const cinquenta = await enviar('proprietario', Array.from({ length: QUANTIDADE_MAXIMA_LOTE_XML_FISCAL }, () => arquivo(xmlNfe())), cenario.clienteB)
    expect(cinquenta).toMatchObject({ sucesso: true, resumo: { total: 50, aceitos: 50 } })

    const antes = await estadoDoUpload()
    const muitos = Array.from({ length: QUANTIDADE_MAXIMA_LOTE_XML_FISCAL + 1 }, () => arquivo(xmlNfe()))
    expect(await enviar('proprietario', muitos, cenario.clienteA)).toMatchObject({ sucesso: false, codigo: 'LOTE_MUITO_GRANDE' })
    expect(await estadoDoUpload()).toEqual(antes)
  })

  it('arquivo individual acima do limite continua sendo resultado do arquivo, não do lote', async () => {
    const grande = arquivo(xmlComTamanho(TAMANHO_MAXIMO_XML_FISCAL + 1), 'grande.xml')
    expect(excedeLimitesDoLote([grande])).toBe(false)
    expect(await enviar('proprietario', [grande, arquivo(xmlNfe())], cenario.clienteA)).toMatchObject({
      sucesso: true,
      arquivos: [{ codigo: 'ARQUIVO_MUITO_GRANDE' }, { codigo: 'ACEITO' }],
    })
  })
})

describe('auditoria', () => {
  it('upload aceito registra documento_fiscal_enviado sem conteúdo fiscal; recusas não geram ruído', async () => {
    const conteudo = xmlNfe('<emit><CNPJ>12ABC34501DE35</CNPJ><xNome>Empresa Sintética</xNome></emit>')
    const antes = (await db.select().from(eventosAuditoria).where(eq(eventosAuditoria.acao, 'documento_fiscal_enviado'))).length
    const resultado = await enviar('proprietario', [arquivo(conteudo), arquivo('<quebrado', 'q.xml')], cenario.clienteA)
    if (!resultado.sucesso || resultado.arquivos[0].codigo !== 'ACEITO') throw new Error('esperado aceito')
    const { documentoId, arquivoId } = resultado.arquivos[0]

    const eventos = await db.select().from(eventosAuditoria).where(eq(eventosAuditoria.acao, 'documento_fiscal_enviado'))
    expect(eventos).toHaveLength(antes + 1)
    const [evento] = eventos.filter((e) => e.registroAfetado === documentoId)
    expect(evento).toMatchObject({
      entidade: 'documento_fiscal',
      autorId: cenario.ids.proprietario,
      empresaId: cenario.empresaId,
      origem: 'admin',
    })
    expect(evento.metadados).toEqual({
      origem: 'envio_usuario',
      clienteId: cenario.clienteA,
      arquivoId,
      tipoArquivo: 'xml',
      tamanhoBytes: bytesDe(conteudo).byteLength,
      statusNovo: 'processado',
    })
    const serializado = JSON.stringify(evento.metadados)
    for (const proibido of ['<', 'nfeProc', '12ABC34501DE35', 'Sintética', 'documentos-fiscais/', calcularSha256(bytesDe(conteudo))]) {
      expect(serializado).not.toContain(proibido)
    }
  })
})

describe('rotas HTTP', () => {
  const url = 'http://localhost:5173/api/documentos-fiscais/xml'

  async function requisicao(formulario: FormData, cabecalhos: Record<string, string> = {}) {
    const bruta = new Request(url, { method: 'POST', body: formulario })
    const corpo = await bruta.arrayBuffer()
    return new Request(url, {
      method: 'POST',
      body: corpo,
      headers: {
        'content-type': bruta.headers.get('content-type')!,
        'content-length': String(corpo.byteLength),
        host: 'localhost:5173',
        ...cabecalhos,
      },
    })
  }

  const formulario = (arquivos: File[], clienteId?: string) => {
    const f = new FormData()
    for (const a of arquivos) f.append('arquivos', a)
    if (clienteId) f.append('clienteId', clienteId)
    return f
  }

  async function baixar(documentoId: string, arquivoId: string) {
    return GET(new Request(`http://localhost:5173/api/documentos-fiscais/${documentoId}/arquivos/${arquivoId}`), {
      params: Promise.resolve({ documentoId, arquivoId }),
    })
  }

  it('upload: sem sessão 401; origem estranha 403; corpo declarado grande 413 antes de ler', async () => {
    sairDaSessao()
    expect((await POST(await requisicao(formulario([arquivo(xmlNfe())])))).status).toBe(401)

    entrarComo(cenario.tokens.proprietario)
    definirCookie(COOKIE_EMPRESA_ATIVA, cenario.empresaId)
    expect((await POST(await requisicao(formulario([arquivo(xmlNfe())]), { origin: 'https://evil.test' }))).status).toBe(403)

    const falsa = new Request(url, { method: 'POST', body: 'x', headers: { 'content-length': String(10 * 1024 * 1024), host: 'localhost:5173' } })
    const resposta = await POST(falsa)
    expect(resposta.status).toBe(413)
    expect(await resposta.json()).toMatchObject({ codigo: 'LOTE_MUITO_GRANDE' })
  })

  describe('tamanho da requisição', () => {
    /** Corpo servido sob demanda, contando quanto a rota de fato consumiu. */
    function corpoMedido(bytes: Uint8Array) {
      const medida = { lidos: 0 }
      let posicao = 0
      const fluxo = new ReadableStream<Uint8Array>({
        pull(controle) {
          if (posicao >= bytes.byteLength) return controle.close()
          const pedaco = bytes.slice(posicao, posicao + 64 * 1024)
          posicao += pedaco.byteLength
          medida.lidos += pedaco.byteLength
          controle.enqueue(pedaco)
        },
        // Sem pré-leitura: `pull` só roda quando alguém de fato lê.
      }, { highWaterMark: 0 })
      return { fluxo, medida }
    }

    async function multipart(formulario: FormData) {
      const bruta = new Request(url, { method: 'POST', body: formulario })
      return { corpo: new Uint8Array(await bruta.arrayBuffer()), tipo: bruta.headers.get('content-type')! }
    }

    /** Requisição sem `Content-Length`, como num envio fragmentado. */
    const semTamanho = (fluxo: ReadableStream<Uint8Array>, tipo: string) =>
      new Request(url, { method: 'POST', body: fluxo, duplex: 'half', headers: { 'content-type': tipo, host: 'localhost:5173' } } as RequestInit)

    beforeEach(() => {
      entrarComo(cenario.tokens.proprietario)
      definirCookie(COOKIE_EMPRESA_ATIVA, cenario.empresaId)
    })

    it('lote cheio (soma no limite) atravessa a rota: o envelope real cabe na requisição', async () => {
      const metade = TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2
      const pedido = await requisicao(formulario([arquivo(xmlComTamanho(metade)), arquivo(xmlComTamanho(metade))], cenario.clienteA))
      expect(Number(pedido.headers.get('content-length'))).toBeLessThanOrEqual(TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL)
      const resposta = await POST(pedido)
      expect(resposta.status).toBe(200)
      expect(await resposta.json()).toMatchObject({ sucesso: true, resumo: { aceitos: 2 } })
    })

    it('Content-Length acima do limite → 413 sem consumir o corpo', async () => {
      const antes = await estadoDoUpload()
      const { corpo, tipo } = await multipart(formulario([arquivo(xmlNfe())], cenario.clienteA))
      const { fluxo, medida } = corpoMedido(corpo)
      const pedido = new Request(url, {
        method: 'POST',
        body: fluxo,
        duplex: 'half',
        headers: { 'content-type': tipo, 'content-length': String(TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL + 1), host: 'localhost:5173' },
      } as RequestInit)
      const resposta = await POST(pedido)
      expect(resposta.status).toBe(413)
      expect(await resposta.json()).toMatchObject({ codigo: 'LOTE_MUITO_GRANDE' })
      expect(medida.lidos).toBe(0)
      expect(await estadoDoUpload()).toEqual(antes)
    })

    it('Content-Length inválido ou zero → 400', async () => {
      for (const valor of ['abc', '-1', '1e6', '0']) {
        const pedido = new Request(url, { method: 'POST', body: 'x', headers: { 'content-length': valor, host: 'localhost:5173' } })
        expect((await POST(pedido)).status, valor).toBe(400)
      }
    })

    it('sem Content-Length, lote normal é aceito', async () => {
      const { corpo, tipo } = await multipart(formulario([arquivo(xmlNfe(), 'sem-tamanho.xml')], cenario.clienteA))
      const resposta = await POST(semTamanho(corpoMedido(corpo).fluxo, tipo))
      expect(resposta.status).toBe(200)
      expect(await resposta.json()).toMatchObject({ sucesso: true, arquivos: [{ codigo: 'ACEITO', nome: 'sem-tamanho.xml' }] })
    })

    it('sem Content-Length, corpo acima do limite → 413 com leitura interrompida', async () => {
      const antes = await estadoDoUpload()
      const { corpo, tipo } = await multipart(
        formulario([arquivo(xmlComTamanho(TAMANHO_MAXIMO_XML_FISCAL)), arquivo(xmlComTamanho(TAMANHO_MAXIMO_XML_FISCAL))], cenario.clienteA),
      )
      expect(corpo.byteLength).toBeGreaterThan(TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL)
      const { fluxo, medida } = corpoMedido(corpo)
      const resposta = await POST(semTamanho(fluxo, tipo))
      expect(resposta.status).toBe(413)
      expect(await resposta.json()).toMatchObject({ codigo: 'LOTE_MUITO_GRANDE' })
      expect(medida.lidos).toBeLessThan(corpo.byteLength)
      expect(await estadoDoUpload()).toEqual(antes)
    })

    it('sem Content-Length, corpo dentro da requisição mas soma dos arquivos acima do lote → 413 pela soma real', async () => {
      const antes = await estadoDoUpload()
      const metade = TAMANHO_MAXIMO_LOTE_XML_FISCAL / 2
      const { corpo, tipo } = await multipart(
        formulario([arquivo(xmlComTamanho(metade)), arquivo(xmlComTamanho(metade + 1))], cenario.clienteA),
      )
      expect(corpo.byteLength).toBeLessThanOrEqual(TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL)
      const resposta = await POST(semTamanho(corpoMedido(corpo).fluxo, tipo))
      expect(resposta.status).toBe(413)
      expect(await resposta.json()).toMatchObject({ codigo: 'LOTE_MUITO_GRANDE' })
      expect(await estadoDoUpload()).toEqual(antes)
    })
  })

  it('upload: empresa vem do contexto validado da sessão; cliente de fora é recusado', async () => {
    entrarComo(cenario.tokens.proprietario)
    // Cookie apontando para outro escritório não vale: o contexto cai no vínculo real.
    definirCookie(COOKIE_EMPRESA_ATIVA, cenario.empresaGestorId)
    const aceito = await POST(await requisicao(formulario([arquivo(xmlNfe(), 'via-rota.xml')], cenario.clienteA)))
    expect(aceito.status).toBe(200)
    const corpo = await aceito.json()
    expect(corpo).toMatchObject({ sucesso: true, arquivos: [{ codigo: 'ACEITO', nome: 'via-rota.xml' }] })
    const [doc] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, corpo.arquivos[0].documentoId))
    expect(doc.empresaId).toBe(cenario.empresaId)

    const fora = await POST(await requisicao(formulario([arquivo(xmlNfe())], cenario.clienteSozinho)))
    expect(fora.status).toBe(403)
    expect(await fora.json()).toEqual({
      sucesso: false,
      codigo: 'CLIENTE_FORA_DO_ESCOPO',
      mensagem: expect.any(String),
    })

    entrarComo(cenario.tokens.estranho)
    expect((await POST(await requisicao(formulario([arquivo(xmlNfe())])))).status).toBe(403)
  })

  it('download: bytes exatos, headers seguros e auditoria; acesso cruzado não enxerga nada', async () => {
    const conteudo = `\ufeff${xmlNfe()}`
    const doA = await enviar('proprietario', [arquivo(conteudo, 'nota a.xml')], cenario.clienteA)
    const doB = await enviar('proprietario', [arquivo(xmlNfe())], cenario.clienteB)
    if (!doA.sucesso || doA.arquivos[0].codigo !== 'ACEITO' || !doB.sucesso || doB.arquivos[0].codigo !== 'ACEITO') {
      throw new Error('esperado aceito')
    }
    const a = doA.arquivos[0]
    const b = doB.arquivos[0]

    sairDaSessao()
    expect((await baixar(a.documentoId, a.arquivoId)).status).toBe(401)

    entrarComo(cenario.tokens.proprietario)
    const resposta = await baixar(a.documentoId, a.arquivoId)
    expect(resposta.status).toBe(200)
    expect(new Uint8Array(await resposta.arrayBuffer())).toEqual(bytesDe(conteudo))
    expect(resposta.headers.get('content-disposition')).toBe('attachment; filename="nota_a.xml"')
    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff')
    expect(resposta.headers.get('cache-control')).toBe('private, no-store')
    expect(resposta.headers.get('content-type')).toBe('application/xml; charset=utf-8')
    const baixados = await db.select().from(eventosAuditoria).where(and(eq(eventosAuditoria.acao, 'documento_fiscal_baixado'), eq(eventosAuditoria.registroAfetado, a.documentoId)))
    expect(baixados).toHaveLength(1)
    expect(JSON.stringify(baixados[0].metadados)).not.toContain('<')

    // Colaborador atribuído ao cliente A baixa o de A, não o de B.
    entrarComo(cenario.tokens.colaboradorMembro)
    expect((await baixar(a.documentoId, a.arquivoId)).status).toBe(200)
    expect((await baixar(b.documentoId, b.arquivoId)).status).toBe(404)

    // Arquivo de um documento pedido pelo id de outro.
    entrarComo(cenario.tokens.proprietario)
    expect((await baixar(b.documentoId, a.arquivoId)).status).toBe(404)

    for (const persona of ['estranho', 'gestor', 'colaboradorExterno', 'gestorProfissional'] as const) {
      entrarComo(cenario.tokens[persona])
      expect((await baixar(a.documentoId, a.arquivoId)).status, persona).toBe(404)
    }
    entrarComo(semPermissao.token)
    expect((await baixar(a.documentoId, a.arquivoId)).status).toBe(404)
    expect((await baixar('nao-e-uuid', a.arquivoId)).status).toBe(404)
  })
})
