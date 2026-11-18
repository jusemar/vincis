import { nomeCompletoDoEscritorio } from '@/features/empresas/lib/titulo-escritorio'
import { identificacaoProfissional } from '@/features/profissionais/lib/identificacao-profissional'
import { URL_CANONICA_SITE, caminhoPerfilPublico } from '../constants/indexacao'

/**
 * SEO do perfil público (`/perfil-profissional?prestador=<id>`).
 *
 * Funções puras: recebem só o que a identidade pública já expõe (a mesma que a
 * página desenha) e devolvem textos e JSON-LD. Nada aqui consulta banco nem
 * acrescenta informação — título, descrição e dados estruturados só repetem o
 * que o visitante vê no perfil. Avaliações, registro profissional, preços e
 * disponibilidade ficam de fora de propósito.
 */

export type DadosSeoPerfil = {
  prestadorId: string
  nome: string
  escritorioNome: string | null
  tipoProfissional: string
  cidade: string | null
  estado: string | null
  especialidades: string[]
  apresentacao: string | null
  sobreTexto: string | null
  fotoDestaqueUrl: string | null
  avatarUrl: string | null
}

/** Acima disso o Google corta o título na página de resultados. */
const LIMITE_TITULO = 70
/** Faixa em que a descrição costuma aparecer inteira. */
const LIMITE_DESCRICAO = 160
const MARCA = 'Vincis'

const limpar = (texto: string | null | undefined) => texto?.replace(/\s+/g, ' ').trim() ?? ''

function listarEmTexto(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

export function urlCanonicaPerfil(prestadorId: string): string {
  return new URL(caminhoPerfilPublico(prestadorId), URL_CANONICA_SITE).toString()
}

/** Nome como o perfil se apresenta: o escritório, quando houver; senão a pessoa. */
function nomePublico(dados: DadosSeoPerfil): string {
  return dados.escritorioNome ? nomeCompletoDoEscritorio(dados.escritorioNome) : limpar(dados.nome)
}

/** "Belo Horizonte/MG" — só com os dois dados, o mesmo formato do perfil. */
function localizacao(dados: DadosSeoPerfil): string | null {
  const cidade = limpar(dados.cidade)
  const uf = limpar(dados.estado).toUpperCase()
  return cidade && uf ? `${cidade}/${uf}` : null
}

/**
 * A profissão, com o mesmo rótulo dos cards da vitrine. Escritório ganha a
 * forma por extenso ("Escritório de contabilidade"), porque o rótulo curto do
 * card ("Contabilidade") sozinho não diz que é um escritório.
 */
function profissao(dados: DadosSeoPerfil): string | null {
  const identificacao = identificacaoProfissional(dados.tipoProfissional, Boolean(dados.escritorioNome))
  if (!identificacao) return null
  if (identificacao.tipo === 'escritorio_contabil') return 'Escritório de contabilidade'
  if (identificacao.tipo === 'escritorio_juridico') return 'Escritório de advocacia'
  return identificacao.rotulo
}

/**
 * Versão curta para o título: o nome do escritório já diz "Escritório", então
 * basta a área — sobra espaço para a cidade, que pesa mais na busca local.
 */
function profissaoNoTitulo(dados: DadosSeoPerfil): string | null {
  const identificacao = identificacaoProfissional(dados.tipoProfissional, Boolean(dados.escritorioNome))
  if (!identificacao) return null
  if (identificacao.tipo === 'escritorio_contabil') return 'Contabilidade'
  if (identificacao.tipo === 'escritorio_juridico') return 'Advocacia'
  return identificacao.rotulo
}

function ehAdvocacia(dados: DadosSeoPerfil) {
  return dados.tipoProfissional === 'advocacia'
}

/**
 * Especialidades (ou áreas de atuação, na advocacia) exatamente como o perfil
 * exibe ao visitante.
 *
 * Os regimes atendidos (MEI, Simples Nacional…) ficam de fora de propósito:
 * o perfil só os mostra no modo de edição do dono, e título, descrição e
 * dados estruturados não podem afirmar o que a página não mostra.
 */
function especialidades(dados: DadosSeoPerfil): string[] {
  return [...new Set(dados.especialidades.map(limpar).filter(Boolean))]
}

/**
 * Foco do título: a primeira especialidade (ou área de atuação) exibida no
 * perfil — "Contador – Imposto de Renda", "Advogado – Direito empresarial".
 * Sem dado, sem foco.
 */
function focoDoTitulo(dados: DadosSeoPerfil): string | null {
  const [area] = especialidades(dados)
  return area ? ` – ${area}` : null
}

/**
 * "Nome | Contador – MEI em Belo Horizonte/MG | Vincis".
 *
 * Se passar do limite, perde primeiro o foco e depois a cidade — o nome e a
 * marca ficam sempre.
 */
export function montarTituloPerfil(dados: DadosSeoPerfil): string {
  const nome = nomePublico(dados)
  const rotulo = profissaoNoTitulo(dados)
  const local = localizacao(dados)
  const foco = focoDoTitulo(dados)
  const emLocal = local ? ` em ${local}` : ''

  const candidatos = rotulo
    ? [`${rotulo}${foco ?? ''}${emLocal}`, `${rotulo}${emLocal}`, `${rotulo}${foco ?? ''}`, rotulo]
    : [local ?? '']

  for (const meio of candidatos) {
    const titulo = [nome, meio, MARCA].filter(Boolean).join(' | ')
    if (titulo.length <= LIMITE_TITULO) return titulo
  }
  return `${nome} | ${MARCA}`
}

/** Corta na última palavra inteira antes do limite, com reticências. */
function encurtar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto
  const corte = texto.slice(0, limite - 1)
  const ultimoEspaco = corte.lastIndexOf(' ')
  return `${(ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte).replace(/[\s,.;:–-]+$/, '')}…`
}

/**
 * Descrição natural e específica de cada perfil:
 * "Conheça Junior Rocha, contador em Belo Horizonte/MG. Especialidades:
 * Tributário e RH. Veja o perfil completo na Vincis."
 *
 * Os trechos opcionais entram enquanto couberem; a apresentação escrita pelo
 * próprio profissional é usada quando não há especialidades a citar.
 */
export function montarDescricaoPerfil(dados: DadosSeoPerfil): string {
  const nome = nomePublico(dados)
  const rotulo = profissao(dados)
  const local = localizacao(dados)
  const listaEspecialidades = especialidades(dados).slice(0, 3)

  const abertura = [
    `Conheça ${nome}`,
    rotulo ? `, ${rotulo.toLowerCase()}` : '',
    local ? ` em ${local}` : '',
    '.',
  ].join('')
  const fechamento = `Veja o perfil completo na ${MARCA}.`

  const complementos: string[] = []
  if (listaEspecialidades.length) {
    const rotuloLista = ehAdvocacia(dados) ? 'Áreas de atuação' : 'Especialidades'
    complementos.push(`${rotuloLista}: ${listarEmTexto(listaEspecialidades)}.`)
  } else {
    const textoProprio = limpar(dados.apresentacao) || limpar(dados.sobreTexto)
    if (textoProprio) {
      const espaco = LIMITE_DESCRICAO - abertura.length - fechamento.length - 2
      if (espaco > 40) complementos.push(encurtar(textoProprio, espaco))
    }
  }

  const completa = [abertura, ...complementos, fechamento].join(' ')
  if (completa.length <= LIMITE_DESCRICAO) return completa
  const semComplemento = `${abertura} ${fechamento}`
  return semComplemento.length <= LIMITE_DESCRICAO ? semComplemento : encurtar(abertura, LIMITE_DESCRICAO)
}

/**
 * Foto pública utilizável em prévia de link: só endereço absoluto `https` fora
 * de máquina local. Caminho relativo ou armazenamento local do `next dev`
 * nunca vai para a produção.
 */
export function imagemPublicaPerfil(dados: DadosSeoPerfil): string | null {
  for (const candidata of [dados.fotoDestaqueUrl, dados.avatarUrl]) {
    if (!candidata) continue
    try {
      const url = new URL(candidata)
      const local = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname)
      if (url.protocol === 'https:' && !local) return url.toString()
    } catch {
      // Não é URL absoluta — ignorada.
    }
  }
  return null
}

/**
 * JSON-LD: ProfilePage cujo assunto é a pessoa (Person) ou o escritório
 * (Organization), mais a BreadcrumbList que o perfil já desenha
 * ("Início › Profissionais › Nome").
 *
 * Sem `aggregateRating`, `review`, credenciais, preços ou endereço completo:
 * só nome, profissão, cidade/UF, especialidades, apresentação e foto públicas.
 */
export function montarDadosEstruturadosPerfil(dados: DadosSeoPerfil) {
  const url = urlCanonicaPerfil(dados.prestadorId)
  const nome = nomePublico(dados)
  const rotulo = profissao(dados)
  const imagem = imagemPublicaPerfil(dados)
  const descricao = limpar(dados.apresentacao) || limpar(dados.sobreTexto)
  const assuntos = especialidades(dados)
  const cidade = limpar(dados.cidade)
  const uf = limpar(dados.estado).toUpperCase()
  const endereco =
    cidade || uf
      ? {
          '@type': 'PostalAddress',
          ...(cidade ? { addressLocality: cidade } : {}),
          ...(uf ? { addressRegion: uf } : {}),
          addressCountry: 'BR',
        }
      : undefined
  const idAssunto = `${url}#perfil`

  const assunto = dados.escritorioNome
    ? {
        '@type': 'Organization',
        '@id': idAssunto,
        name: nome,
        url,
        ...(descricao || rotulo ? { description: descricao || rotulo } : {}),
        ...(endereco ? { address: endereco } : {}),
        ...(assuntos.length ? { knowsAbout: assuntos } : {}),
        ...(imagem ? { image: imagem } : {}),
        // A pessoa que o perfil mostra como "Responsável técnico".
        employee: { '@type': 'Person', name: limpar(dados.nome), jobTitle: 'Responsável técnico' },
      }
    : {
        '@type': 'Person',
        '@id': idAssunto,
        name: nome,
        url,
        ...(rotulo ? { jobTitle: rotulo } : {}),
        ...(descricao ? { description: descricao } : {}),
        ...(endereco ? { address: endereco } : {}),
        ...(assuntos.length ? { knowsAbout: assuntos } : {}),
        ...(imagem ? { image: imagem } : {}),
      }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${url}#pagina`,
        url,
        name: montarTituloPerfil(dados),
        inLanguage: 'pt-BR',
        isPartOf: { '@type': 'WebSite', name: MARCA, url: `${URL_CANONICA_SITE}/` },
        mainEntity: { '@id': idAssunto },
        breadcrumb: { '@id': `${url}#trilha` },
      },
      assunto,
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#trilha`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: `${URL_CANONICA_SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Profissionais', item: `${URL_CANONICA_SITE}/profissionais` },
          { '@type': 'ListItem', position: 3, name: nome, item: url },
        ],
      },
    ],
  }
}
