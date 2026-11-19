import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  conhecimentoArtigoVersoes,
  conhecimentoArtigos,
  conhecimentoCategorias,
  conhecimentoDecisoes,
  conhecimentoDestaquesHome,
  eventosAuditoria,
  perfisProfissionais,
} from '@/db/schema'
import { operarArtigoProfissional, salvarArtigoProfissional } from '@/features/conhecimento/actions/artigos-autor'
import { decidirArtigo, salvarArtigoInstitucional } from '@/features/conhecimento/actions/moderacao'
import { verificarSlugArtigo } from '@/features/conhecimento/actions/slug'
import { enviarImagemArtigo } from '@/features/conhecimento/actions/imagens'
import { definirArtigoNoCardHome } from '@/features/conhecimento/actions/destaques-home'
import { aplicarArtigosAosCards, obterPainelCardsHomeDoArtigo } from '@/features/conhecimento/queries/destaques-home'
import { alterarIdentidadePublica } from '@/features/usuarios/actions/identidade-publica'
import { resolverAcessoUsuario } from '@/features/usuarios/queries/obter-destino-apos-login'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { montarDadosEstruturadosArtigo, montarMetadadosArtigo } from '@/features/conhecimento/lib/seo-artigo'
import { palavrasChaveSchema } from '@/features/conhecimento/schemas/artigo'
import { conteudoArtigoSchema } from '@/features/conhecimento/lib/conteudo/schema-conteudo'
import { decidirEdicao, situacaoEditorial } from '@/features/conhecimento/lib/fluxo-editorial'
import { montarBaseSlugArtigo } from '@/features/conhecimento/lib/slug-artigo'
import { obterArtigoEmEdicao } from '@/features/conhecimento/queries/privado'
import {
  listarArtigosParaSitemap,
  listarArtigosPublicados,
  listarArtigosPublicadosDoAutor,
  obterArtigoPublicado,
} from '@/features/conhecimento/queries/publico'
import { resolverRedirecionamentoPerfilLegado } from '@/features/perfis/lib/redirecionamento-perfil'
import { escolherSlugLivre, montarBaseSlugPerfil } from '@/features/perfis/lib/montar-slug-perfil'
import { garantirSlugDoPrestador, obterPrestadorPeloSlug } from '@/features/perfis/lib/slug-perfil'
import { perfilEhIndexavel } from '@/features/profissionais/queries/perfis-indexaveis'
import { pesquisarProfissionaisReais } from '@/features/profissionais/queries/pesquisar-profissionais'
import { ehFotoPublicaValida } from '@/features/profissionais/lib/vitrine-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@conhecimento.teste'
type Chave = 'autora' | 'outro' | 'semfoto' | 'oculto' | 'gestor' | 'cliente'
let contas: Record<Chave, ContaDeTeste>
let categoriaId: string

const FOTO = '/api/armazenamento-local/perfis-profissionais/teste/avatar/foto.webp'

function paragrafo(texto: string) {
  return { type: 'paragraph', content: [{ type: 'text', text: texto }] }
}

/** Artigo completo o bastante para ser enviado. */
function dadosCompletos(titulo: string) {
  return {
    titulo,
    resumo: 'Resumo do artigo com o tamanho mínimo exigido para o envio à aprovação da Vincis.',
    categoriaId,
    capaUrl: null,
    capaAlt: null,
    conteudo: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introdução' }] },
        paragrafo('Texto do artigo. '.repeat(50)),
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragrafo('Faixa')] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null }, content: [paragrafo('1ª')] }] },
          ],
        },
      ],
    },
    fontes: [{ titulo: 'Lei Complementar 123/2006', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm' }],
    tituloSeo: null,
    descricaoSeo: null,
  }
}

async function limparArtigos(ids: string[]) {
  const artigos = await db.select({ id: conhecimentoArtigos.id }).from(conhecimentoArtigos).where(inArray(conhecimentoArtigos.autorId, ids))
  const artigoIds = artigos.map(({ id }) => id)
  if (artigoIds.length) {
    await db.update(conhecimentoDestaquesHome).set({ artigoId: null }).where(inArray(conhecimentoDestaquesHome.artigoId, artigoIds))
    await db.delete(conhecimentoDecisoes).where(inArray(conhecimentoDecisoes.artigoId, artigoIds))
    await db.update(conhecimentoArtigos).set({ versaoPublicadaId: null, statusPublicacao: 'arquivado' }).where(inArray(conhecimentoArtigos.id, artigoIds))
    await db.delete(conhecimentoArtigoVersoes).where(inArray(conhecimentoArtigoVersoes.artigoId, artigoIds))
    await db.delete(conhecimentoArtigos).where(inArray(conhecimentoArtigos.id, artigoIds))
  }
  await db.delete(eventosAuditoria).where(or(inArray(eventosAuditoria.autorId, ids), inArray(eventosAuditoria.usuarioId, ids)))
}

beforeAll(async () => {
  contas = await criarContas<Chave>(SUFIXO, {
    autora: { perfil: 'profissional', prestador: 'profissional' },
    outro: { perfil: 'profissional', prestador: 'profissional' },
    semfoto: { perfil: 'profissional', prestador: 'profissional' },
    oculto: { perfil: 'profissional', prestador: 'profissional' },
    gestor: { perfil: 'gestor_vincis' },
    cliente: { perfil: 'cliente' },
  })
  // Foto pública (vitrine) para quem pode publicar; `oculto` tem foto mas foi
  // retirado pela Gestão; `semfoto` fica sem.
  await db
    .update(perfisProfissionais)
    .set({ avatarUrl: FOTO })
    .where(inArray(perfisProfissionais.usuarioId, [contas.autora.id, contas.outro.id, contas.oculto.id]))
  await db
    .update(perfisProfissionais)
    .set({ ocultoVitrineEm: new Date(), motivoOcultacaoVitrine: 'perfil de teste' })
    .where(eq(perfisProfissionais.usuarioId, contas.oculto.id))

  await db
    .insert(conhecimentoCategorias)
    .values({ nome: 'Categoria de teste', slug: 'categoria-de-teste-suite', areaBusca: 'contabilidade' })
    .onConflictDoNothing()
  const [categoria] = await db
    .select({ id: conhecimentoCategorias.id })
    .from(conhecimentoCategorias)
    .where(eq(conhecimentoCategorias.slug, 'categoria-de-teste-suite'))
  categoriaId = categoria.id
})

afterAll(async () => {
  sairDaSessao()
  await limparArtigos(Object.values(contas).map(({ id }) => id))
  await db.delete(conhecimentoCategorias).where(eq(conhecimentoCategorias.slug, 'categoria-de-teste-suite'))
  await limparContas(SUFIXO)
})

describe('regras puras', () => {
  it('slug de perfil: acentos, tratamento, escritório e unicidade', () => {
    expect(
      montarBaseSlugPerfil({ nome: 'Dra. Ána Lúcia Çá', escritorioNome: null, tipoProfissional: 'advocacia', cidade: 'São Paulo' }),
    ).toBe('ana-lucia-ca-advocacia-sao-paulo')
    expect(
      montarBaseSlugPerfil({ nome: 'Rafael', escritorioNome: 'Alfa', tipoProfissional: 'contabilidade', cidade: 'Belo Horizonte' }),
    ).toBe('escritorio-alfa-contabilidade-belo-horizonte')
    expect(montarBaseSlugPerfil({ nome: '!!!', escritorioNome: null, tipoProfissional: null, cidade: '' })).toBe('perfil')
    expect(escolherSlugLivre('maria', new Set(['maria', 'maria-2']))).toBe('maria-3')
  })

  it('slug de artigo nunca ocupa segmento reservado', () => {
    expect(montarBaseSlugArtigo('Prévia')).toBe('artigo-previa')
    expect(montarBaseSlugArtigo('Como declarar o IRPF 2027?')).toBe('como-declarar-o-irpf-2027')
  })

  it('conteúdo: lista fechada — sem script, sem javascript:, sem imagem externa', () => {
    const doc = (no: unknown) => ({ type: 'doc', content: [no] })
    expect(conteudoArtigoSchema.safeParse(doc({ type: 'codeBlock', content: [] })).success).toBe(false)
    expect(conteudoArtigoSchema.safeParse(doc({ type: 'paragraph', attrs: { onclick: 'x' } })).success).toBe(false)
    expect(
      conteudoArtigoSchema.safeParse(
        doc({ type: 'paragraph', content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }),
      ).success,
    ).toBe(false)
    expect(conteudoArtigoSchema.safeParse(doc({ type: 'image', attrs: { src: 'https://exemplo.com/x.png', alt: 'x' } })).success).toBe(false)
    expect(
      conteudoArtigoSchema.safeParse(doc({ type: 'image', attrs: { src: '/api/armazenamento-local/conhecimento/u/x.png', alt: 'x' } })).success,
    ).toBe(true)
    expect(conteudoArtigoSchema.safeParse(doc({ type: 'heading', attrs: { level: 1 }, content: [] })).success).toBe(false)
    expect(conteudoArtigoSchema.safeParse(doc({ type: 'tableRow', content: [] })).success).toBe(false)
  })

  it('situação editorial e revisão de publicado', () => {
    expect(situacaoEditorial({ statusPublicacao: 'publicado', versaoAberta: { status: 'aguardando_aprovacao' }, ultimaVersao: null })).toBe(
      'aguardando_aprovacao',
    )
    expect(situacaoEditorial({ statusPublicacao: 'nao_publicado', versaoAberta: null, ultimaVersao: { status: 'rejeitada' } })).toBe('rejeitado')
    expect(decidirEdicao({ statusPublicacao: 'publicado', versaoAberta: null, ultimaVersao: { status: 'aprovada' } }).tipo).toBe('abrir_revisao')
    expect(decidirEdicao({ statusPublicacao: 'nao_publicado', versaoAberta: { status: 'aguardando_aprovacao' }, ultimaVersao: null }).tipo).toBe(
      'bloqueado',
    )
  })

  it('foto pública válida', () => {
    expect(ehFotoPublicaValida('https://cdn.exemplo/x.webp')).toBe(true)
    expect(ehFotoPublicaValida(FOTO)).toBe(true)
    expect(ehFotoPublicaValida('')).toBe(false)
    expect(ehFotoPublicaValida('//host/x.png')).toBe(false)
    expect(ehFotoPublicaValida('http://inseguro/x.png')).toBe(false)
  })
})

describe('vitrine e endereços dos perfis', () => {
  it('sem foto e ocultado ficam fora da busca pública e do índice; com foto entra', async () => {
    const { profissionais } = await pesquisarProfissionaisReais({ tipoPrestador: 'publico', busca: 'Teste', porPagina: 30 })
    const ids = profissionais.map(({ id }) => id)
    expect(ids).toContain(contas.autora.id)
    expect(ids).not.toContain(contas.semfoto.id)
    expect(ids).not.toContain(contas.oculto.id)
    expect(await perfilEhIndexavel(contas.semfoto.id)).toBe(false)
    expect(await perfilEhIndexavel(contas.oculto.id)).toBe(false)
  })

  it('slug é gerado uma vez, é único e o endereço antigo redireciona', async () => {
    const slug = await garantirSlugDoPrestador(contas.autora.id)
    expect(slug).toMatch(/^teste-autora-contabilidade-sao-paulo/)
    expect(await garantirSlugDoPrestador(contas.autora.id)).toBe(slug)
    expect(await obterPrestadorPeloSlug(slug!)).toBe(contas.autora.id)
    const outro = await garantirSlugDoPrestador(contas.outro.id)
    expect(outro).not.toBe(slug)
    // Mudar o nome não muda o endereço.
    await db.update(perfisProfissionais).set({ cidade: 'Recife' }).where(eq(perfisProfissionais.usuarioId, contas.autora.id))
    expect(await garantirSlugDoPrestador(contas.autora.id)).toBe(slug)
    const destino = await resolverRedirecionamentoPerfilLegado(contas.autora.id, { prestador: contas.autora.id, entrar: '1' })
    expect(destino).toBe(`/profissionais/${slug}?entrar=1`)
    // Perfil oculto continua abrindo pelo link (não é excluído).
    expect(await resolverRedirecionamentoPerfilLegado(contas.oculto.id, {})).toMatch(/^\/profissionais\//)
  })
})

describe('fluxo editorial', () => {
  let artigoId: string

  it('perfil fora da vitrine e cliente não criam artigo', async () => {
    entrarComo(contas.semfoto.token)
    const semFoto = await salvarArtigoProfissional({ dados: dadosCompletos('Artigo sem foto no perfil'), intencao: 'rascunho' })
    expect(semFoto.sucesso).toBe(false)
    entrarComo(contas.cliente.token)
    expect((await salvarArtigoProfissional({ dados: dadosCompletos('Artigo do cliente'), intencao: 'rascunho' })).sucesso).toBe(false)
  })

  it('autora salva rascunho; HTML/script é recusado no servidor', async () => {
    entrarComo(contas.autora.token)
    const perigoso = await salvarArtigoProfissional({
      dados: { ...dadosCompletos('Artigo perigoso'), conteudo: { type: 'doc', content: [{ type: 'html', text: '<script>alert(1)</script>' }] } },
      intencao: 'rascunho',
    })
    expect(perigoso.sucesso).toBe(false)

    const resposta = await salvarArtigoProfissional({ dados: dadosCompletos('Como funciona o Simples Nacional'), intencao: 'rascunho' })
    expect(resposta.sucesso).toBe(true)
    artigoId = (resposta as { artigoId: string }).artigoId
    const [artigo] = await db.select().from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, artigoId))
    // Autoria vem da sessão.
    expect(artigo.autorId).toBe(contas.autora.id)
    expect(artigo.statusPublicacao).toBe('nao_publicado')
  })

  it('outro profissional não enxerga nem altera o artigo', async () => {
    entrarComo(contas.outro.token)
    expect(await obterArtigoEmEdicao(artigoId, { tipo: 'profissional', autorId: contas.outro.id })).toBeNull()
    const tentativa = await salvarArtigoProfissional({ artigoId, dados: dadosCompletos('Sequestro de artigo'), intencao: 'rascunho' })
    expect(tentativa.sucesso).toBe(false)
    expect((await operarArtigoProfissional({ artigoId, operacao: 'arquivar' })).sucesso).toBe(false)
  })

  it('envio incompleto é recusado; completo vai para a fila e não aparece em público', async () => {
    entrarComo(contas.autora.token)
    const incompleto = await salvarArtigoProfissional({ artigoId, dados: { ...dadosCompletos('Curto'), resumo: 'curto' }, intencao: 'enviar' })
    expect(incompleto.sucesso).toBe(false)
    expect((incompleto as { problemas?: string[] }).problemas?.length).toBeGreaterThan(0)

    const enviado = await salvarArtigoProfissional({ artigoId, dados: dadosCompletos('Como funciona o Simples Nacional'), intencao: 'enviar' })
    expect(enviado.sucesso).toBe(true)
    const edicao = await obterArtigoEmEdicao(artigoId, { tipo: 'profissional', autorId: contas.autora.id })
    expect(edicao?.situacao).toBe('aguardando_aprovacao')
    expect((await listarArtigosPublicados({ pagina: 1, porPagina: 50 })).itens.map(({ id }) => id)).not.toContain(artigoId)
  })

  it('só a Gestão decide; devolver exige observação', async () => {
    entrarComo(contas.autora.token)
    expect((await decidirArtigo({ artigoId, decisao: 'aprovar' })).sucesso).toBe(false)
    entrarComo(contas.gestor.token)
    expect((await decidirArtigo({ artigoId, decisao: 'devolver', observacao: 'curta' })).sucesso).toBe(false)
    expect((await decidirArtigo({ artigoId, decisao: 'devolver', observacao: 'Inclua a fonte da tabela do Anexo III.' })).sucesso).toBe(true)

    entrarComo(contas.autora.token)
    const devolvido = await obterArtigoEmEdicao(artigoId, { tipo: 'profissional', autorId: contas.autora.id })
    expect(devolvido?.situacao).toBe('devolvido')
    expect(devolvido?.observacaoModeracao).toContain('Anexo III')
    expect((await salvarArtigoProfissional({ artigoId, dados: dadosCompletos('Como funciona o Simples Nacional'), intencao: 'enviar' })).sucesso).toBe(true)
  })

  it('aprovado: aparece na Central, no perfil da autora e no sitemap, com autoria real', async () => {
    entrarComo(contas.gestor.token)
    expect((await decidirArtigo({ artigoId, decisao: 'aprovar' })).sucesso).toBe(true)
    const [artigo] = await db.select().from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, artigoId))
    const publicado = await obterArtigoPublicado(artigo.slug)
    expect(publicado?.titulo).toBe('Como funciona o Simples Nacional')
    expect(publicado?.autor.tipo).toBe('profissional')
    if (publicado?.autor.tipo === 'profissional') {
      expect(publicado.autor.nome).toBe('Teste autora')
      expect(publicado.autor.perfilUrl).toMatch(/^\/profissionais\//)
    }
    expect((await listarArtigosPublicadosDoAutor(contas.autora.id, 10)).map(({ id }) => id)).toContain(artigoId)
    expect(await listarArtigosPublicadosDoAutor(contas.outro.id, 10)).toHaveLength(0)
    expect((await listarArtigosParaSitemap()).map(({ slug }) => slug)).toContain(artigo.slug)
    const decisoes = await db.select().from(conhecimentoDecisoes).where(eq(conhecimentoDecisoes.artigoId, artigoId))
    expect(decisoes.map(({ acao }) => acao)).toEqual(expect.arrayContaining(['criado', 'enviado', 'devolvido', 'aprovado']))
  })

  it('editar publicado abre revisão sem trocar o texto no ar até nova aprovação', async () => {
    entrarComo(contas.autora.token)
    const [{ slug }] = await db.select({ slug: conhecimentoArtigos.slug }).from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, artigoId))
    const revisao = await salvarArtigoProfissional({ artigoId, dados: dadosCompletos('Simples Nacional em 2027: o que mudou'), intencao: 'enviar' })
    expect(revisao.sucesso).toBe(true)
    expect((await obterArtigoPublicado(slug))?.titulo).toBe('Como funciona o Simples Nacional')

    entrarComo(contas.gestor.token)
    expect((await decidirArtigo({ artigoId, decisao: 'aprovar' })).sucesso).toBe(true)
    const atualizado = await obterArtigoPublicado(slug)
    // Slug fixo após a primeira publicação; texto novo no ar.
    expect(atualizado?.titulo).toBe('Simples Nacional em 2027: o que mudou')
    expect(atualizado?.slug).toBe(slug)
  })

  it('despublicar tira da Central, do perfil e do sitemap', async () => {
    entrarComo(contas.gestor.token)
    const [{ slug }] = await db.select({ slug: conhecimentoArtigos.slug }).from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, artigoId))
    expect((await decidirArtigo({ artigoId, decisao: 'destacar' })).sucesso).toBe(true)
    expect((await decidirArtigo({ artigoId, decisao: 'despublicar', observacao: 'Revisão da legislação.' })).sucesso).toBe(true)
    expect(await obterArtigoPublicado(slug)).toBeNull()
    expect(await listarArtigosPublicadosDoAutor(contas.autora.id, 10)).toHaveLength(0)
    expect((await listarArtigosParaSitemap()).map((item) => item.slug)).not.toContain(slug)
    const [artigo] = await db.select().from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, artigoId))
    expect(artigo.destaque).toBe(false)
  })

  it('artigo institucional é publicado pela Gestão e assinado como Vincis', async () => {
    entrarComo(contas.gestor.token)
    const resposta = await salvarArtigoInstitucional({
      dados: dadosCompletos('Novidades da Central de Conhecimento'),
      assinatura: 'vincis',
      intencao: 'publicar',
    })
    expect(resposta.sucesso).toBe(true)
    const [artigo] = await db
      .select()
      .from(conhecimentoArtigos)
      .where(eq(conhecimentoArtigos.id, (resposta as { artigoId: string }).artigoId))
    const publicado = await obterArtigoPublicado(artigo.slug)
    expect(publicado?.autor).toEqual({ tipo: 'institucional', nome: 'Vincis', responsavel: null })
    // Profissional não chama a action institucional.
    entrarComo(contas.autora.token)
    expect((await salvarArtigoInstitucional({ dados: dadosCompletos('Falso institucional'), assinatura: 'vincis', intencao: 'publicar' })).sucesso).toBe(false)
  })
})

describe('URL amigável, palavras-chave e SEO', () => {
  it('slug escolhido é normalizado; conflito é recusado com sugestão; reservado é recusado', async () => {
    entrarComo(contas.autora.token)
    const criado = await salvarArtigoProfissional({
      dados: { ...dadosCompletos('Guia do Simples Nacional'), slug: 'Guia Prático Ação' },
      intencao: 'rascunho',
    })
    expect(criado.sucesso).toBe(true)
    const id = (criado as { artigoId: string }).artigoId
    const [artigo] = await db.select().from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, id))
    expect(artigo.slug).toBe('guia-pratico-acao')

    // Outro autor pede a mesma URL: recusa explícita, com sugestão livre.
    entrarComo(contas.outro.token)
    const conflito = await salvarArtigoProfissional({
      dados: { ...dadosCompletos('Outro guia'), slug: 'guia-pratico-acao' },
      intencao: 'rascunho',
    })
    expect(conflito.sucesso).toBe(false)
    expect((conflito as { problemas?: string[] }).problemas?.join(' ')).toContain('guia-pratico-acao-2')
    const situacao = await verificarSlugArtigo({ slug: 'guia-pratico-acao', artigoId: null })
    expect(situacao).toMatchObject({ disponivel: false, sugestao: 'guia-pratico-acao-2' })
    // O próprio artigo não conflita consigo mesmo.
    expect((await verificarSlugArtigo({ slug: 'guia-pratico-acao', artigoId: id }))?.disponivel).toBe(true)

    const reservado = await salvarArtigoProfissional({ dados: { ...dadosCompletos('Reservado'), slug: 'previa' }, intencao: 'rascunho' })
    expect(reservado.sucesso).toBe(false)

    // Cliente não consulta disponibilidade.
    entrarComo(contas.cliente.token)
    expect(await verificarSlugArtigo({ slug: 'qualquer', artigoId: null })).toBeNull()
  })

  it('palavras-chave: sem repetição, limite de 10, entram na busca e no JSON-LD; SEO personalizado e automático', async () => {
    expect(palavrasChaveSchema.parse([' DAS ', 'das', 'MEI', ''])).toEqual(['DAS', 'MEI'])
    expect(palavrasChaveSchema.safeParse(Array.from({ length: 11 }, (_, i) => `termo ${i}`)).success).toBe(false)

    entrarComo(contas.autora.token)
    const enviado = await salvarArtigoProfissional({
      dados: {
        ...dadosCompletos('Calendário do DASN para microempreendedores'),
        slug: 'calendario-dasn-mei',
        palavrasChave: ['DASN-SIMEI', 'prazo anual'],
        tituloSeo: 'Calendário do DASN-SIMEI | Vincis',
        descricaoSeo: null,
      },
      intencao: 'enviar',
    })
    expect(enviado.sucesso).toBe(true)
    const id = (enviado as { artigoId: string }).artigoId
    entrarComo(contas.gestor.token)
    expect((await decidirArtigo({ artigoId: id, decisao: 'aprovar' })).sucesso).toBe(true)

    const publicado = await obterArtigoPublicado('calendario-dasn-mei')
    expect(publicado?.palavrasChave).toEqual(['DASN-SIMEI', 'prazo anual'])
    const metadados = montarMetadadosArtigo(publicado!)
    expect(metadados.title).toEqual({ absolute: 'Calendário do DASN-SIMEI | Vincis' })
    // Meta descrição vazia → automática (resumo); nenhuma meta keywords.
    expect(metadados.description).toBe(publicado!.resumo)
    expect(metadados).not.toHaveProperty('keywords')
    expect(JSON.stringify(montarDadosEstruturadosArtigo(publicado!))).toContain('"keywords":"DASN-SIMEI, prazo anual"')
    const busca = await listarArtigosPublicados({ busca: 'prazo anual', pagina: 1 })
    expect(busca.itens.map(({ slug }) => slug)).toContain('calendario-dasn-mei')

    // Depois de publicado, a URL não muda — nem se outra for pedida na revisão.
    entrarComo(contas.autora.token)
    const revisao = await salvarArtigoProfissional({
      artigoId: id,
      dados: { ...dadosCompletos('Calendário do DASN (revisado)'), slug: 'outra-url-qualquer', palavrasChave: ['DASN-SIMEI', 'prazo anual'] },
      intencao: 'rascunho',
    })
    expect(revisao.sucesso).toBe(true)
    const [depois] = await db.select().from(conhecimentoArtigos).where(eq(conhecimentoArtigos.id, id))
    expect(depois.slug).toBe('calendario-dasn-mei')
    const edicao = await obterArtigoEmEdicao(id, { tipo: 'profissional', autorId: contas.autora.id })
    expect(edicao?.slugFixo).toBe(true)
    expect(edicao?.dados.palavrasChave).toEqual(['DASN-SIMEI', 'prazo anual'])
    // A versão no ar segue intacta enquanto a revisão não é aprovada.
    expect((await obterArtigoPublicado('calendario-dasn-mei'))?.titulo).toBe('Calendário do DASN para microempreendedores')
  })
})

describe('upload de imagem do artigo (capa e corpo)', () => {
  // Driver local numa pasta temporária: o teste nunca alcança o Blob.
  const PNG_ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  function arquivo(nome: string, tipo: string, cabecalho: number[], tamanho: number) {
    const bytes = new Uint8Array(tamanho)
    bytes.set(cabecalho)
    for (let i = cabecalho.length; i < tamanho; i += 1) bytes[i] = (i * 31) % 251
    return new File([bytes], nome, { type: tipo })
  }
  async function enviar(file: File) {
    const formulario = new FormData()
    formulario.set('imagem', file)
    return enviarImagemArtigo(formulario)
  }

  beforeAll(async () => {
    vi.stubEnv('ARMAZENAMENTO_IMAGENS', 'local')
    vi.stubEnv('ARMAZENAMENTO_LOCAL_DIR', await mkdtemp(path.join(tmpdir(), 'vincis-conhecimento-')))
  })
  afterAll(() => vi.unstubAllEnvs())

  it('PNG de ~2,96 MB, JPG e WebP são aceitos e gravados sem alteração', async () => {
    entrarComo(contas.autora.token)
    const casos = [
      arquivo('capa-original.png', 'image/png', PNG_ASSINATURA, 3_104_573),
      arquivo('foto.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe0], 1_500_000),
      arquivo('capa.webp', 'image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')], 800_000),
    ]
    for (const original of casos) {
      const resposta = await enviar(original)
      expect(resposta.sucesso, original.name).toBe(true)
      const url = (resposta as { url: string }).url
      expect(url).toMatch(/^\/api\/armazenamento-local\/conhecimento\//)
      const gravado = await readFile(path.join(process.env.ARMAZENAMENTO_LOCAL_DIR!, url.replace('/api/armazenamento-local/', '')))
      // Byte a byte igual ao enviado: sem conversão, compressão ou redimensionamento.
      expect(Buffer.compare(gravado, Buffer.from(await original.arrayBuffer()))).toBe(0)
    }
  })

  it('recusas com mensagem específica: tamanho, formato, assinatura falsa e sessão', async () => {
    entrarComo(contas.autora.token)
    const grande = await enviar(arquivo('grande.png', 'image/png', PNG_ASSINATURA, 5 * 1024 * 1024 + 1))
    expect(grande).toMatchObject({ sucesso: false, mensagem: expect.stringContaining('5 MB') })
    const formato = await enviar(new File(['texto'], 'nota.txt', { type: 'text/plain' }))
    expect(formato).toMatchObject({ sucesso: false, mensagem: expect.stringContaining('JPG, PNG ou WEBP') })
    const falso = await enviar(new File(['<svg onload=alert(1)>'], 'falso.png', { type: 'image/png' }))
    expect(falso).toMatchObject({ sucesso: false, mensagem: expect.stringContaining('não corresponde') })
    sairDaSessao()
    const semSessao = await enviar(arquivo('capa.png', 'image/png', PNG_ASSINATURA, 1000))
    expect(semSessao).toMatchObject({ sucesso: false, mensagem: expect.stringContaining('sessão') })
  })
})

describe('identidade pública da equipe Vincis (sem mexer em permissões)', () => {
  const SUFIXO_EQUIPE = '@equipe-vincis.teste'
  let equipe: Record<'gestorprof', ContaDeTeste>
  let artigoId: string

  beforeAll(async () => {
    // Gestor que também é Profissional contábil aprovado (o caso real da conta de testes).
    equipe = await criarContas(SUFIXO_EQUIPE, {
      gestorprof: { perfil: 'gestor_vincis', perfisExtras: ['profissional'], prestador: 'profissional' },
    }, '119477')
    await db
      .update(perfisProfissionais)
      .set({ avatarUrl: FOTO, especialidades: ['Tributário'], modalidadeAtuacao: 'individual' })
      .where(eq(perfisProfissionais.usuarioId, equipe.gestorprof.id))
  })
  afterAll(async () => {
    await limparArtigos([equipe.gestorprof.id])
    await limparContas(SUFIXO_EQUIPE)
  })

  it('só Gestor pode virar equipe Vincis; só Gestor altera', async () => {
    entrarComo(contas.autora.token)
    expect((await alterarIdentidadePublica({ usuarioId: equipe.gestorprof.id, identidade: 'equipe_vincis' })).sucesso).toBe(false)
    entrarComo(contas.gestor.token)
    // Profissional comum não pode ser apresentado como equipe.
    expect((await alterarIdentidadePublica({ usuarioId: contas.outro.id, identidade: 'equipe_vincis' })).sucesso).toBe(false)
    expect((await alterarIdentidadePublica({ usuarioId: equipe.gestorprof.id, identidade: 'equipe_vincis' })).sucesso).toBe(true)
  })

  it('permissões e capacidades continuam iguais; sai da vitrine e do índice', async () => {
    const acesso = await resolverAcessoUsuario(equipe.gestorprof.id)
    expect(ehGestorPlataforma(acesso)).toBe(true)
    expect(acesso?.areasPermitidas).toContain('/admin')
    entrarComo(equipe.gestorprof.token)
    // Continua operando como prestador (fluxos de teste).
    expect(await obterPrestadorSessao()).not.toBeNull()
    expect(await validarGestorVincis()).not.toBeNull()
    const { profissionais } = await pesquisarProfissionaisReais({ tipoPrestador: 'publico', busca: 'gestorprof', porPagina: 30 })
    expect(profissionais.map(({ id }) => id)).not.toContain(equipe.gestorprof.id)
    expect(await perfilEhIndexavel(equipe.gestorprof.id)).toBe(false)
  })

  it('artigo da conta assina como equipe: sem profissão, escritório nem perfil; contato do Suporte', async () => {
    entrarComo(equipe.gestorprof.token)
    const enviado = await salvarArtigoProfissional({
      dados: { ...dadosCompletos('Novidades da equipe para quem usa a Vincis'), slug: 'novidades-da-equipe-vincis' },
      intencao: 'enviar',
    })
    expect(enviado.sucesso).toBe(true)
    artigoId = (enviado as { artigoId: string }).artigoId
    entrarComo(contas.gestor.token)
    expect((await decidirArtigo({ artigoId, decisao: 'aprovar' })).sucesso).toBe(true)
    const publicado = await obterArtigoPublicado('novidades-da-equipe-vincis')
    expect(publicado?.autor).toMatchObject({
      tipo: 'equipe',
      nome: 'Teste gestorprof',
      fotoUrl: FOTO,
      funcao: 'Gestor da Plataforma Vincis',
      identificacao: 'Equipe Vincis · Suporte e Gestão',
      contato: { rotulo: 'Falar com o Suporte Vincis', href: '/suporte' },
    })
    const jsonLd = JSON.stringify(montarDadosEstruturadosArtigo(publicado!))
    expect(jsonLd).toContain('"jobTitle":"Gestor da Plataforma Vincis"')
    expect(jsonLd).not.toContain('/profissionais/')
    expect(jsonLd).not.toContain('Contador')
    // Profissional de verdade segue com profissão e perfil.
    const daAutora = (await listarArtigosPublicados({ pagina: 1, porPagina: 30 })).itens.find((a) => a.autor.tipo === 'profissional')
    if (daAutora?.autor.tipo === 'profissional') expect(daAutora.autor.perfilUrl).toMatch(/^\/profissionais\//)
  })

  it('cards da Home: artigo publicado entra, despublicado restaura, rascunho é recusado', async () => {
    const CARD = '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a02'
    const original = { id: CARD, selo: 'Original', titulo: 'Card original', descricao: 'Descrição original', textoBotao: 'Ver', estilo: 'esmeralda' as const, href: '/profissionais' }

    entrarComo(contas.autora.token)
    expect((await definirArtigoNoCardHome({ cardId: CARD, artigoId })).sucesso).toBe(false)

    entrarComo(contas.gestor.token)
    expect((await definirArtigoNoCardHome({ cardId: CARD, artigoId })).sucesso).toBe(true)
    const [comArtigo] = await aplicarArtigosAosCards([original])
    expect(comArtigo).toMatchObject({ id: CARD, estilo: 'esmeralda', textoBotao: 'Ler artigo', href: '/conhecimento/novidades-da-equipe-vincis' })
    expect(comArtigo.titulo).toBe('Novidades da equipe para quem usa a Vincis')
    // Sem capa: card só com texto. Com capa: a mesma URL e o mesmo alt da capa publicada.
    expect(comArtigo.imagem ?? null).toBeNull()
    const [{ versaoId }] = await db
      .select({ versaoId: conhecimentoArtigos.versaoPublicadaId })
      .from(conhecimentoArtigos)
      .where(eq(conhecimentoArtigos.id, artigoId))
    const capa = '/api/armazenamento-local/conhecimento/teste/capa.webp'
    await db.update(conhecimentoArtigoVersoes).set({ capaUrl: capa, capaAlt: 'Capa de teste' }).where(eq(conhecimentoArtigoVersoes.id, versaoId!))
    expect((await aplicarArtigosAosCards([original]))[0].imagem).toEqual({ url: capa, alt: 'Capa de teste' })
    // O card original nunca ganha imagem.
    expect(original).not.toHaveProperty('imagem')

    // Rascunho não pode ir para a Home.
    entrarComo(contas.autora.token)
    const rascunho = await salvarArtigoProfissional({ dados: dadosCompletos('Rascunho que não vai para a Home'), intencao: 'rascunho' })
    entrarComo(contas.gestor.token)
    const recusado = await definirArtigoNoCardHome({ cardId: CARD, artigoId: (rascunho as { artigoId: string }).artigoId })
    expect(recusado.sucesso).toBe(false)

    // Despublicar devolve o card original sozinho.
    expect((await decidirArtigo({ artigoId, decisao: 'despublicar' })).sucesso).toBe(true)
    expect((await aplicarArtigosAosCards([original]))[0]).toEqual(original)

    // Restaurar explicitamente zera o vínculo (o card do CMS nunca foi alterado).
    expect((await definirArtigoNoCardHome({ cardId: CARD, artigoId: null })).sucesso).toBe(true)
    const [vinculo] = await db.select().from(conhecimentoDestaquesHome).where(eq(conhecimentoDestaquesHome.cardId, CARD))
    expect(vinculo.artigoId).toBeNull()
  })

  it('editor do artigo: painel dos cards só para o Gestor, sincronizado com a Gestão, e troca de card', async () => {
    const CARD_1 = '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a01'
    const CARD_3 = '5b0c2a6e-6f3d-4c1a-9a51-0c4a1d7e9a03'
    const vinculoDo = async (cardId: string) =>
      (await db.select().from(conhecimentoDestaquesHome).where(eq(conhecimentoDestaquesHome.cardId, cardId)))[0]?.artigoId ?? null

    // Profissional não recebe o painel (nem para o próprio artigo).
    entrarComo(contas.autora.token)
    expect(await obterPainelCardsHomeDoArtigo(artigoId)).toBeNull()
    const rascunho = (await salvarArtigoProfissional({ dados: dadosCompletos('Rascunho para o painel da Home'), intencao: 'rascunho' })) as { artigoId: string }

    entrarComo(contas.gestor.token)
    // Artigo não publicado (e artigo novo): opção indisponível.
    expect((await obterPainelCardsHomeDoArtigo(rascunho.artigoId))?.artigoPublicado).toBe(false)
    expect((await obterPainelCardsHomeDoArtigo(null))?.artigoPublicado).toBe(false)

    expect((await decidirArtigo({ artigoId, decisao: 'republicar' })).sucesso).toBe(true)
    const painel = await obterPainelCardsHomeDoArtigo(artigoId)
    expect(painel?.artigoPublicado).toBe(true)
    expect(painel?.cards.map((card) => card.cardId)).toEqual(expect.arrayContaining([CARD_1, CARD_3]))

    // Escolhido pelo editor → aparece igual para a Gestão (mesma tabela).
    expect((await definirArtigoNoCardHome({ cardId: CARD_1, artigoId, liberarCardAnterior: true })).sucesso).toBe(true)
    expect((await obterPainelCardsHomeDoArtigo(artigoId))?.cards.find((card) => card.cardId === CARD_1)).toMatchObject({ artigoId, artigoNoAr: true })

    // Regra da Gestão continua: sem a opção, o mesmo artigo não vai para outro card.
    expect((await definirArtigoNoCardHome({ cardId: CARD_3, artigoId })).sucesso).toBe(false)
    expect(await vinculoDo(CARD_1)).toBe(artigoId)

    // Pelo editor, mover libera o card anterior (volta ao original) numa transação.
    expect((await definirArtigoNoCardHome({ cardId: CARD_3, artigoId, liberarCardAnterior: true })).sucesso).toBe(true)
    expect(await vinculoDo(CARD_1)).toBeNull()
    expect(await vinculoDo(CARD_3)).toBe(artigoId)

    // Retirar da Home restaura o original.
    expect((await definirArtigoNoCardHome({ cardId: CARD_3, artigoId: null })).sucesso).toBe(true)
    expect(await vinculoDo(CARD_3)).toBeNull()

    // Profissional também não grava com a opção nova.
    entrarComo(contas.autora.token)
    expect((await definirArtigoNoCardHome({ cardId: CARD_1, artigoId, liberarCardAnterior: true })).sucesso).toBe(false)
  })
})
