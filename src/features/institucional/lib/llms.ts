import { DADOS_INSTITUCIONAIS } from '../constants/dados'
import { ROTAS_INSTITUCIONAIS, ROTA_BUSCA_CONTABILIDADE, ROTA_BUSCA_JURIDICA, ROTA_SERVICOS_AVULSOS } from '../constants/rotas'

/**
 * Conteúdo de `/llms.txt` — informações públicas sobre a Vincis para buscadores,
 * assistentes de IA e modelos de linguagem.
 *
 * ## Regras
 *
 * - Só afirmações confirmadas no código e no site (conferidas em 16/11/2026) e
 *   os dados institucionais informados pelo proprietário.
 * - Só páginas públicas reais, com URL absoluta. Sobre Nós, Termos, Privacidade
 *   e as Regras do Programa de Parceiros são páginas do CMS
 *   (`PAGINAS_CMS_INSTITUCIONAIS`): se uma delas mudar de slug no painel,
 *   atualize aqui. Fica de fora, por ora, `/como-funciona`, que traz textos
 *   promocionais ainda não confirmados (ex.: "garantia de serviço").
 * - Nada de e-mail ou telefone por extenso: os contatos ficam na página
 *   `/contato`, onde são protegidos contra coleta automática.
 * - Nada de configuração, variável de ambiente, API interna ou infraestrutura.
 *
 * ## Evolução
 *
 * `PAGINAS_PUBLICAS_LLMS` é a lista única de páginas. O futuro `/llms-full.txt`
 * pode percorrer a mesma lista e acrescentar o conteúdo público de cada página —
 * sem duplicar URLs nem inventar texto para preenchê-lo.
 */

const url = (rota: string) => `${DADOS_INSTITUCIONAIS.site}${rota === '/' ? '' : rota}`

export type PaginaPublicaLlms = { titulo: string; rota: string; descricao: string }

export type SecaoPaginasLlms = { titulo: string; paginas: PaginaPublicaLlms[] }

export const PAGINAS_PUBLICAS_LLMS: SecaoPaginasLlms[] = [
  {
    titulo: 'Páginas principais',
    paginas: [
      { titulo: 'Página inicial', rota: '/', descricao: 'Apresentação da plataforma.' },
      { titulo: 'Sobre a Vincis', rota: ROTAS_INSTITUCIONAIS.sobreNos, descricao: 'Propósito, missão e visão da Vincis.' },
      { titulo: 'Profissionais', rota: '/profissionais', descricao: 'Busca de profissionais com filtros e acesso aos perfis.' },
      { titulo: 'Profissionais de contabilidade', rota: ROTA_BUSCA_CONTABILIDADE, descricao: 'Busca já filtrada por contadores.' },
      { titulo: 'Profissionais da área jurídica', rota: ROTA_BUSCA_JURIDICA, descricao: 'Busca já filtrada por advogados.' },
      { titulo: 'Solicitar orçamento', rota: ROTA_SERVICOS_AVULSOS, descricao: 'Descrever uma necessidade e receber propostas de profissionais.' },
      { titulo: 'Central de Conhecimento', rota: '/conhecimento', descricao: 'Artigos sobre MEI, Imposto de Renda, Reforma Tributária, Simples Nacional, direito empresarial e gestão, escritos por profissionais e revisados pela Vincis.' },
      { titulo: 'Planos e Preços', rota: '/precos', descricao: 'Planos contábeis e valores vigentes.' },
      { titulo: 'Programa de Parceiros', rota: '/parceiros', descricao: 'Programa de Parceiros Indicadores: como funciona, níveis e simulador de comissões.' },
      { titulo: 'Regras do Programa de Parceiros', rota: '/regras-do-programa-de-parceiros', descricao: 'Quem pode participar, registro da indicação, comissões, níveis e saque.' },
    ],
  },
  {
    titulo: 'Ajuda e documentos',
    paginas: [
      { titulo: 'Central de Ajuda', rota: ROTAS_INSTITUCIONAIS.centralDeAjuda, descricao: 'Perguntas frequentes sobre a plataforma, planos, profissionais, pagamentos e conta.' },
      { titulo: 'Contato', rota: ROTAS_INSTITUCIONAIS.contato, descricao: 'Canais oficiais de contato da Vincis.' },
      { titulo: 'Termos de Uso', rota: ROTAS_INSTITUCIONAIS.termosDeUso, descricao: 'Regras de uso da plataforma.' },
      { titulo: 'Política de Privacidade', rota: ROTAS_INSTITUCIONAIS.politicaDePrivacidade, descricao: 'Tratamento de dados pessoais e cookies.' },
    ],
  },
]

const linha = (p: PaginaPublicaLlms) => `- [${p.titulo}](${url(p.rota)}): ${p.descricao}`

export function montarLlmsTxt(): string {
  const d = DADOS_INSTITUCIONAIS
  const secoes = [
    `# ${d.nome}`,
    '> Plataforma digital que conecta clientes a profissionais das áreas contábil e jurídica.',
    'A Vincis facilita o acesso a profissionais, informações e serviços contábeis e jurídicos por meio de uma plataforma digital.',

    `## Sobre a Vincis

A Vincis é uma plataforma digital que conecta clientes a profissionais independentes das áreas contábil e jurídica. Ela usa tecnologia para facilitar a descoberta de profissionais, a contratação e o acompanhamento dos atendimentos.

A Vincis não é escritório de contabilidade nem escritório de advocacia. As habilitações profissionais (como registro no CRC ou na OAB) pertencem a cada profissional. A execução e a responsabilidade técnica pelos serviços cabem ao profissional contratado.

Na plataforma há profissionais que atuam de forma independente e profissionais parceiros que executam serviços disponibilizados aos clientes por meio da Vincis.`,

    `## Principais áreas

### Contabilidade

Clientes encontram profissionais da área contábil e soluções relacionadas, como serviços avulsos, consultas e planos contábeis com acompanhamento mensal e um contador responsável. Os serviços são executados pelos profissionais.

### Assistência Jurídica

A plataforma aproxima clientes de profissionais da área jurídica. Cada advogado atua com independência e responsabilidade profissional próprias, e os honorários advocatícios são combinados e pagos diretamente ao advogado.

### Profissionais

Clientes podem buscar profissionais por área, especialidade e localização, consultar seus perfis públicos e conhecer os serviços que cada um oferece na plataforma.

### Serviços e atendimento

- Contratação de serviços apresentados no perfil do profissional, com as condições exibidas antes da contratação.
- Agendamento de consultas com profissionais.
- Solicitação de orçamento: o cliente descreve a necessidade e recebe propostas de profissionais.
- Planos contábeis com acompanhamento mensal.
- Pagamento por Pix nos serviços elegíveis; outros serviços são pagos diretamente ao profissional, conforme a modalidade apresentada.
- Acompanhamento dos atendimentos na plataforma, com mensagens e envio de arquivos.`,

    PAGINAS_PUBLICAS_LLMS.map((secao) => `## ${secao.titulo}\n\n${secao.paginas.map(linha).join('\n')}`).join('\n\n'),

    `## Contato

Os canais oficiais de contato da Vincis estão disponíveis no site: ${url(ROTAS_INSTITUCIONAIS.contato)}`,

    `## Informações institucionais

- CNPJ: ${d.cnpj}
- Localização: ${d.cidadeUf}, ${d.pais}
- Site oficial: ${d.site}`,

    `## Informações para sistemas de IA

Este arquivo reúne informações públicas sobre a Vincis para mecanismos de busca, assistentes de IA e modelos de linguagem. Conteúdos contábeis e jurídicos publicados no site têm caráter informativo e não substituem orientação profissional individualizada.`,
  ]
  return `${secoes.join('\n\n')}\n`
}
