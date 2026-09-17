import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  documentosFiscais,
  documentosFiscaisArquivos,
  documentosFiscaisEventos,
  documentosFiscaisExtracoes,
  empresaMembros,
  empresas,
  eventosAuditoria,
  perfisPermissoes,
  perfisProfissionais,
} from '@/db/schema'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '@/features/documentos-fiscais/constants/permissoes'
import { perfilVeDocumentosFiscais } from '@/features/documentos-fiscais/constants/rotas'
import {
  categoriaProfissionalEhContabil,
  elegivelParaCentralFiscal,
} from '@/features/documentos-fiscais/lib/elegibilidade-fiscal'
import { usuarioElegivelParaCentralFiscal } from '@/features/documentos-fiscais/queries/elegibilidade-fiscal'
import { resolverAcessoDocumentosFiscais } from '@/features/documentos-fiscais/lib/acesso-documentos-fiscais'
import { obterDocumentoFiscal } from '@/features/documentos-fiscais/queries/obter-documento-fiscal'
import { obterArquivoOriginalParaDownload } from '@/features/documentos-fiscais/queries/obter-arquivo-original'
import { listarDocumentosFiscais } from '@/features/documentos-fiscais/queries/listar-documentos-fiscais'
import { possuiPermissao } from '@/features/usuarios/lib/possui-permissao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { limparCenario, montarCenario, type Cenario } from './setup/personas'
import { entrarComo, sairDaSessao } from './setup/sessao'

/*
  Fase 1.10 — elegibilidade contábil da Central Fiscal.

  Documentos Fiscais é módulo da atividade contábil: ter perfil `profissional`
  (ou até a permissão) não basta. Aqui as personas são criadas com áreas reais e
  testadas contra TODAS as fronteiras do servidor, sem passar pela interface.
*/

const armazenamento = vi.hoisted(() => ({ objetos: new Map<string, Uint8Array>() }))

vi.mock('@/features/documentos-fiscais/lib/armazenamento-fiscal', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/documentos-fiscais/lib/armazenamento-fiscal')>()
  return {
    montarChaveOriginal: original.montarChaveOriginal,
    gravarOriginalPrivado: async (chave: string, bytes: Uint8Array) => {
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
const { reprocessarDocumentoFiscalAction, reprocessarDocumentosFiscaisEmLote } = await import(
  '@/features/documentos-fiscais/actions/reprocessar-documento'
)
const { marcarDocumentoFiscalRevisado, revisarDocumentosFiscaisEmLote } = await import(
  '@/features/documentos-fiscais/actions/revisar-documento'
)

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/documentos-fiscais')
const MIGRATION_0066 = readFileSync(path.resolve(process.cwd(), 'drizzle/0066_documentos_fiscais.sql'), 'utf8')
const CHAVE_FIXTURE = '35260912345678000195550010000000011000000017'
const SUFIXO = '@elegibilidade.fiscal.teste'

let cenario: Cenario
let vinculosCriados: { perfilId: string; permissaoId: string }[] = []
let contas: Record<'advogado' | 'especialistaFiscal' | 'outraArea' | 'colaboradorJuridico', { id: string; token: string }>
let escritorioJuridicoId: string
let documentoId: string
let arquivoId: string
let sequencia = 0

function nfe() {
  sequencia += 1
  const chave = `${CHAVE_FIXTURE.slice(0, 35)}${String(sequencia).padStart(8, '0')}7`
  return readFileSync(path.join(FIXTURES, 'nfe-proc-completa.xml'), 'utf8').replaceAll(CHAVE_FIXTURE, chave)
}

const enviarComo = (usuarioId: string, empresaId = cenario.empresaId) =>
  receberXmlsFiscais({
    usuarioId,
    empresaId,
    clienteId: cenario.clienteA,
    arquivos: [new File([nfe()], 'nfe.xml', { type: 'application/xml' })],
  })

async function limparFiscal() {
  if (!cenario) return
  const alvo = [cenario.empresaId, cenario.empresaGestorId, escritorioJuridicoId].filter(Boolean)
  const docs = await db.select({ id: documentosFiscais.id }).from(documentosFiscais).where(inArray(documentosFiscais.empresaId, alvo))
  const ids = docs.map(({ id }) => id)
  if (ids.length) {
    await db.delete(documentosFiscaisExtracoes).where(inArray(documentosFiscaisExtracoes.documentoFiscalId, ids))
    await db.delete(documentosFiscaisArquivos).where(inArray(documentosFiscaisArquivos.documentoFiscalId, ids))
    await db.delete(documentosFiscaisEventos).where(inArray(documentosFiscaisEventos.documentoFiscalId, ids))
    await db.delete(documentosFiscais).where(inArray(documentosFiscais.id, ids))
  }
  await db.delete(eventosAuditoria).where(and(like(eventosAuditoria.acao, 'documento_fiscal_%'), inArray(eventosAuditoria.empresaId, alvo)))
  armazenamento.objetos.clear()
}

beforeAll(async () => {
  cenario = await montarCenario()
  const antes = new Set((await db.select().from(perfisPermissoes)).map((v) => `${v.perfilId}:${v.permissaoId}`))
  for (const comando of MIGRATION_0066.split('--> statement-breakpoint').map((t) => t.trim()).filter((t) => t.startsWith('INSERT INTO'))) {
    await db.execute(sql.raw(comando))
  }
  vinculosCriados = (await db.select().from(perfisPermissoes)).filter((v) => !antes.has(`${v.perfilId}:${v.permissaoId}`))

  // Todos com perfil `profissional` — e portanto com as permissões fiscais do
  // RBAC. O que os separa é a área de atuação do cadastro.
  contas = await criarContas(
    SUFIXO,
    {
      advogado: { perfil: 'profissional', prestador: 'profissional' },
      especialistaFiscal: { perfil: 'profissional', prestador: 'profissional' },
      outraArea: { perfil: 'profissional', prestador: 'profissional' },
      colaboradorJuridico: { perfil: 'colaborador', prestador: 'colaborador' },
    },
    '119488',
  )

  await db.update(perfisProfissionais).set({ tipoProfissional: 'advocacia' }).where(eq(perfisProfissionais.usuarioId, contas.advogado.id))
  await db.update(perfisProfissionais).set({ tipoProfissional: 'especialista_fiscal' }).where(eq(perfisProfissionais.usuarioId, contas.especialistaFiscal.id))
  // Categoria fora da taxonomia contábil: "outra profissão".
  await db.update(perfisProfissionais).set({ tipoProfissional: 'engenharia' }).where(eq(perfisProfissionais.usuarioId, contas.outraArea.id))
  // O cadastro real do Colaborador grava `colaborador`: a área dele vem do escritório.
  await db.update(perfisProfissionais).set({ tipoProfissional: 'colaborador' }).where(eq(perfisProfissionais.usuarioId, contas.colaboradorJuridico.id))

  // Advogado, especialista fiscal e "outra área" são membros ativos do mesmo
  // escritório contábil: só a área os distingue.
  for (const conta of [contas.advogado, contas.especialistaFiscal, contas.outraArea]) {
    await db.insert(empresaMembros).values({
      empresaId: cenario.empresaId,
      usuarioId: conta.id,
      funcao: 'profissional',
      status: 'ativo',
    })
  }

  // Escritório jurídico, com um colaborador dentro.
  const [juridico] = await db
    .insert(empresas)
    .values({ nome: `Escritório Jurídico ${SUFIXO}`, tipo: 'cliente', segmento: 'advocacia', status: 'ativo' })
    .returning({ id: empresas.id })
  escritorioJuridicoId = juridico.id
  await db.insert(empresaMembros).values({
    empresaId: escritorioJuridicoId,
    usuarioId: contas.colaboradorJuridico.id,
    funcao: 'colaborador',
    status: 'ativo',
  })

  // Um documento real do escritório contábil, alvo das tentativas diretas.
  const importado = await receberXmlsFiscais({
    usuarioId: cenario.ids.proprietario,
    empresaId: cenario.empresaId,
    clienteId: cenario.clienteA,
    arquivos: [new File([nfe()], 'alvo.xml', { type: 'application/xml' })],
  })
  if (!importado.sucesso || importado.arquivos[0].codigo !== 'ACEITO') throw new Error('esperava documento importado')
  documentoId = importado.arquivos[0].documentoId
  arquivoId = importado.arquivos[0].arquivoId
})

afterAll(async () => {
  sairDaSessao()
  await limparFiscal()
  for (const conta of Object.values(contas ?? {})) {
    await db.delete(empresaMembros).where(eq(empresaMembros.usuarioId, conta.id))
  }
  if (escritorioJuridicoId) {
    await db.delete(empresaMembros).where(eq(empresaMembros.empresaId, escritorioJuridicoId))
  }
  await limparContas(SUFIXO)
  if (escritorioJuridicoId) await db.delete(empresas).where(eq(empresas.id, escritorioJuridicoId))
  for (const v of vinculosCriados) {
    await db.delete(perfisPermissoes).where(and(eq(perfisPermissoes.perfilId, v.perfilId), eq(perfisPermissoes.permissaoId, v.permissaoId)))
  }
  await limparCenario()
})

describe('política de elegibilidade (pura)', () => {
  it('a área decide, e o Gestor é a exceção administrativa', () => {
    expect(categoriaProfissionalEhContabil('contabilidade')).toBe(true)
    expect(categoriaProfissionalEhContabil('especialista_fiscal')).toBe(true)
    expect(categoriaProfissionalEhContabil('advocacia')).toBe(false)
    expect(categoriaProfissionalEhContabil(null)).toBe(false)

    const profissional = (tipoProfissional: string) => ({
      ehGestor: false,
      tipoPrestador: 'profissional',
      tipoProfissional,
    })
    expect(elegivelParaCentralFiscal(profissional('contabilidade'))).toBe(true)
    expect(elegivelParaCentralFiscal(profissional('advocacia'))).toBe(false)
    expect(elegivelParaCentralFiscal(profissional('engenharia'))).toBe(false)

    // Colaborador: quem diz a área é o escritório a que está vinculado.
    const colaborador = (segmentoDoEscritorio: string | null) => ({
      ehGestor: false,
      tipoPrestador: 'colaborador',
      tipoProfissional: 'colaborador',
      segmentoDoEscritorio,
    })
    expect(elegivelParaCentralFiscal(colaborador('contabilidade'))).toBe(true)
    expect(elegivelParaCentralFiscal(colaborador('advocacia'))).toBe(false)
    expect(elegivelParaCentralFiscal(colaborador(null))).toBe(false)

    // Gestor passa pela área; escopo e permissão continuam valendo.
    expect(elegivelParaCentralFiscal({ ehGestor: true, tipoPrestador: null, tipoProfissional: null })).toBe(true)
    // Cliente e quem não presta serviço ficam de fora.
    expect(elegivelParaCentralFiscal({ ehGestor: false, tipoPrestador: null, tipoProfissional: null })).toBe(false)
  })

  it('a elegibilidade resolvida no servidor lê o cadastro real de cada conta', async () => {
    expect(await usuarioElegivelParaCentralFiscal(cenario.ids.proprietario)).toBe(true)
    expect(await usuarioElegivelParaCentralFiscal(contas.especialistaFiscal.id)).toBe(true)
    expect(await usuarioElegivelParaCentralFiscal(cenario.ids.colaboradorMembro)).toBe(true)
    expect(await usuarioElegivelParaCentralFiscal(cenario.ids.gestor)).toBe(true)

    expect(await usuarioElegivelParaCentralFiscal(contas.advogado.id)).toBe(false)
    expect(await usuarioElegivelParaCentralFiscal(contas.outraArea.id)).toBe(false)
    expect(await usuarioElegivelParaCentralFiscal(contas.colaboradorJuridico.id)).toBe(false)
    // O colaborador contábil não fica elegível dentro do escritório jurídico.
    expect(await usuarioElegivelParaCentralFiscal(cenario.ids.colaboradorMembro, escritorioJuridicoId)).toBe(false)
  })
})

describe('advogado e outras áreas: recusa em todas as fronteiras', () => {
  const bloqueados = () =>
    [
      ['advogado', contas.advogado],
      ['outra área', contas.outraArea],
      ['colaborador jurídico', contas.colaboradorJuridico],
    ] as const

  it('têm a permissão do RBAC, e ainda assim não passam pela porta do módulo', async () => {
    // A prova do ponto: a permissão existe, a área não.
    expect(await possuiPermissao(contas.advogado.id, PERMISSOES_DOCUMENTOS_FISCAIS.visualizar)).toBe(true)
    expect(await possuiPermissao(contas.advogado.id, PERMISSOES_DOCUMENTOS_FISCAIS.enviar)).toBe(true)

    for (const [nome, conta] of bloqueados()) {
      for (const permissao of Object.values(PERMISSOES_DOCUMENTOS_FISCAIS)) {
        expect(
          await resolverAcessoDocumentosFiscais(conta.id, permissao, cenario.empresaId),
          `${nome} / ${permissao}`,
        ).toBeNull()
      }
    }
  })

  it('não listam, não abrem, não baixam', async () => {
    for (const [nome, conta] of bloqueados()) {
      expect(await obterDocumentoFiscal(conta.id, documentoId), nome).toBeNull()
      expect(
        await obterArquivoOriginalParaDownload({ usuarioId: conta.id, documentoId, arquivoId }),
        nome,
      ).toBeNull()
      // Sem acesso resolvido não existe listagem: a query só nasce do acesso.
      expect(
        await resolverAcessoDocumentosFiscais(conta.id, PERMISSOES_DOCUMENTOS_FISCAIS.visualizar, cenario.empresaId),
        nome,
      ).toBeNull()
    }
  })

  it('não enviam XML, não revisam e não reprocessam — nem em lote', async () => {
    for (const [nome, conta] of bloqueados()) {
      expect(await enviarComo(conta.id), nome).toMatchObject({ sucesso: false, codigo: 'SEM_PERMISSAO' })

      entrarComo(conta.token)
      expect(await marcarDocumentoFiscalRevisado(documentoId), nome).toMatchObject({ sucesso: false })
      expect(await revisarDocumentosFiscaisEmLote([documentoId]), nome).toMatchObject({
        sucesso: false,
        resumo: { revisados: 0, naoElegiveis: 1 },
      })
      expect(await reprocessarDocumentoFiscalAction(documentoId), nome).toMatchObject({
        sucesso: false,
        codigo: 'SEM_PERMISSAO',
      })
      expect(await reprocessarDocumentosFiscaisEmLote([documentoId]), nome).toMatchObject({
        sucesso: false,
        resumo: { reprocessados: 0, naoElegiveis: 1 },
      })
    }

    // Nada mudou no documento depois de todas as tentativas.
    const [documento] = await db.select().from(documentosFiscais).where(eq(documentosFiscais.id, documentoId))
    expect(documento.statusRevisao).toBe('pendente')
    const extracoes = await db
      .select({ id: documentosFiscaisExtracoes.id })
      .from(documentosFiscaisExtracoes)
      .where(eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId))
    expect(extracoes).toHaveLength(1)
  })

  it('não veem o item no menu, nem no desktop nem no mobile', async () => {
    for (const [nome, conta] of bloqueados()) {
      entrarComo(conta.token)
      const sessao = await obterSessaoServidor()
      expect(sessao?.elegivelCentralFiscal, nome).toBe(false)
      // O menu exige elegibilidade **e** permissão do perfil.
      expect(
        Boolean(sessao?.elegivelCentralFiscal) && perfilVeDocumentosFiscais(sessao?.perfilTipo),
        nome,
      ).toBe(false)
    }
  })
})

describe('quem é da atividade contábil continua entrando', () => {
  it('profissional contábil, especialista fiscal, colaborador contábil e Gestor com vínculo', async () => {
    for (const conta of [
      { nome: 'proprietário contábil', id: cenario.ids.proprietario, empresaId: cenario.empresaId },
      { nome: 'especialista fiscal', id: contas.especialistaFiscal.id, empresaId: cenario.empresaId },
      { nome: 'colaborador contábil', id: cenario.ids.colaboradorMembro, empresaId: cenario.empresaId },
      { nome: 'gestor com escritório', id: cenario.ids.gestorProfissional, empresaId: cenario.empresaGestorId },
    ]) {
      const acesso = await resolverAcessoDocumentosFiscais(
        conta.id,
        PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
        conta.empresaId,
      )
      expect(acesso, conta.nome).not.toBeNull()
    }

    // O escopo continua mandando: o especialista é membro comum e só vê os
    // clientes a que tem acesso; quem administra o escritório vê o documento.
    const doEspecialista = await resolverAcessoDocumentosFiscais(
      contas.especialistaFiscal.id,
      PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
      cenario.empresaId,
    )
    const semEscopo = await listarDocumentosFiscais(doEspecialista!, {
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
    })
    expect(semEscopo.documentos).toEqual([])

    const acesso = await resolverAcessoDocumentosFiscais(
      cenario.ids.proprietario,
      PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
      cenario.empresaId,
    )
    const lista = await listarDocumentosFiscais(acesso!, {
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
    })
    expect(lista.documentos.map((d) => d.id)).toContain(documentoId)
  })

  it('elegível mas sem a permissão: o RBAC continua decidindo a ação', async () => {
    // Colaborador é contábil e enxerga o módulo, mas não tem `revisar`.
    expect(await usuarioElegivelParaCentralFiscal(cenario.ids.colaboradorMembro)).toBe(true)
    expect(
      await resolverAcessoDocumentosFiscais(
        cenario.ids.colaboradorMembro,
        PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
        cenario.empresaId,
      ),
    ).not.toBeNull()
    expect(
      await resolverAcessoDocumentosFiscais(
        cenario.ids.colaboradorMembro,
        PERMISSOES_DOCUMENTOS_FISCAIS.revisar,
        cenario.empresaId,
      ),
    ).toBeNull()

    entrarComo(cenario.tokens.colaboradorMembro)
    const sessao = await obterSessaoServidor()
    expect(sessao?.elegivelCentralFiscal).toBe(true)
    expect(perfilVeDocumentosFiscais(sessao?.perfilTipo)).toBe(true)
    expect(await marcarDocumentoFiscalRevisado(documentoId)).toMatchObject({ sucesso: false })
  })

  it('a elegibilidade não afrouxa o isolamento entre escritórios', async () => {
    // Especialista fiscal é elegível, mas não é membro do escritório do Gestor.
    expect(
      await resolverAcessoDocumentosFiscais(
        contas.especialistaFiscal.id,
        PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
        cenario.empresaGestorId,
      ),
    ).toBeNull()
    // Gestor da plataforma sem vínculo continua sem alcançar documento alheio.
    expect(await obterDocumentoFiscal(cenario.ids.gestor, documentoId)).toBeNull()
  })
})
