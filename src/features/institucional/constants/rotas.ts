/**
 * Endereços institucionais e o rodapé do site.
 *
 * O rodapé é fixo no código, igual em todos os ambientes: antes, a produção
 * desenhava colunas do CMS e o localhost as colunas fixas, e os dois divergiam.
 * Todo link aqui leva a uma página real:
 *
 * - Sobre Nós, Termos de Uso e Política de Privacidade são páginas do CMS
 *   (editáveis no painel, iguais no localhost e na produção);
 * - Contato é rota do código (`src/app/contato`): é uma página funcional, com os
 *   botões de contato protegidos contra robôs, que o CMS não renderiza;
 * - Contabilidade e Assistência Jurídica abrem a busca já filtrada;
 * - Serviços Avulsos abre a busca com o pedido de orçamento expandido — o fluxo
 *   real de contratação avulsa (descrever a necessidade → propostas → aceite →
 *   pagamento).
 */
/** Slugs institucionais administrados pelo CMS (não reservar em `rotas-reservadas`). */
export const PAGINAS_CMS_INSTITUCIONAIS = ['sobre-nos', 'termos-de-uso', 'politica-de-privacidade'] as const

export const ROTAS_INSTITUCIONAIS = {
  sobreNos: '/sobre-nos',
  contato: '/contato',
  termosDeUso: '/termos-de-uso',
  politicaDePrivacidade: '/politica-de-privacidade',
  centralDeAjuda: '/suporte',
} as const

/** Filtros lidos pela busca em `features/profissionais/constants/busca-url.ts`. */
export const ROTA_BUSCA_CONTABILIDADE = '/profissionais?area=contabilidade'
export const ROTA_BUSCA_JURIDICA = '/profissionais?area=advocacia'
export const ROTA_SERVICOS_AVULSOS = '/profissionais?orcamento=1'

export type LinkRodape = { texto: string; href: string }
export type GrupoRodape = { titulo: string; links: LinkRodape[] }

export const GRUPOS_RODAPE: GrupoRodape[] = [
  {
    titulo: 'Serviços',
    links: [
      { texto: 'Contabilidade', href: ROTA_BUSCA_CONTABILIDADE },
      { texto: 'Assistência Jurídica', href: ROTA_BUSCA_JURIDICA },
      { texto: 'Serviços Avulsos', href: ROTA_SERVICOS_AVULSOS },
    ],
  },
  {
    titulo: 'Empresa',
    links: [
      { texto: 'Sobre Nós', href: ROTAS_INSTITUCIONAIS.sobreNos },
      { texto: 'Contato', href: ROTAS_INSTITUCIONAIS.contato },
    ],
  },
  {
    titulo: 'Plataforma',
    links: [
      { texto: 'Profissionais', href: '/profissionais' },
      { texto: 'Planos e Preços', href: '/precos' },
      { texto: 'Parceiros', href: '/parceiros' },
    ],
  },
  {
    titulo: 'Suporte',
    links: [
      { texto: 'Central de Ajuda', href: ROTAS_INSTITUCIONAIS.centralDeAjuda },
      { texto: 'Termos de Uso', href: ROTAS_INSTITUCIONAIS.termosDeUso },
      { texto: 'Política de Privacidade', href: ROTAS_INSTITUCIONAIS.politicaDePrivacidade },
    ],
  },
]
