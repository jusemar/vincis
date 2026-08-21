import {
  ESPECIALIDADES_POR_CATEGORIA,
  type CategoriaProfissional,
} from '@/features/profissionais/constants/taxonomia-profissional'

/**
 * Vocabulário das Oportunidades públicas.
 *
 * Oportunidade é a etapa **anterior** à contratação: o Cliente descreve o que
 * precisa, escolhe uma categoria e recebe propostas. Não é Atendimento
 * (trabalho em execução) nem contratação (ato comercial já fechado) — por isso
 * o vocabulário de status é próprio.
 *
 * ## Categoria pública ≠ tipo profissional interno
 *
 * O Cliente escolhe entre **duas** categorias: Contabilidade e Jurídico. Ele
 * não decide se o caso dele é de contador, de especialista fiscal ou de
 * colaborador contábil — esse enquadramento é responsabilidade da plataforma, e
 * pedir isso a quem está justamente com dúvida seria devolver o problema.
 *
 * Nada foi apagado nem fundido por causa disso: `perfis_profissionais`
 * continua com `contabilidade`, `especialista_fiscal` e `advocacia` intactos, e
 * a busca pública continua filtrando por eles. Esta é uma camada de
 * **agrupamento de apresentação**: cada categoria pública lista os tipos
 * internos que ela alcança em `tiposProfissionais`, e é essa lista — nunca uma
 * comparação de texto com o nome da categoria — que a compatibilidade usa.
 *
 * O valor gravado em `oportunidades.categoria` é a chave pública, que coincide
 * de propósito com o tipo interno principal de cada grupo (`contabilidade`,
 * `advocacia`): as solicitações já existentes continuam válidas sem migração de
 * dados.
 */

export const CATEGORIAS_OPORTUNIDADE = ['contabilidade', 'advocacia'] as const

export type CategoriaOportunidade = (typeof CATEGORIAS_OPORTUNIDADE)[number]

export const CATEGORIA_OPORTUNIDADE: Record<
  CategoriaOportunidade,
  {
    rotulo: string
    descricao: string
    /** Tipos internos alcançados por esta categoria pública. */
    tiposProfissionais: CategoriaProfissional[]
    /** Especialidades oferecidas ao Cliente dentro da categoria. */
    especialidades: readonly string[]
    /**
     * Termos que reconhecem a atuação de um Colaborador nesta área.
     *
     * Casam por *substring* no texto livre que o Colaborador escreveu, então
     * precisam ser inequívocos: um termo genérico como `process` ou `depart`
     * alcançaria "Melhoria de Processos" e "Departamento Jurídico", tornando
     * elegível para Contabilidade quem nunca declarou atuação contábil. É a
     * mesma razão por que dados de teste de TI e Marketing **não** podem virar
     * porta de entrada — nenhum termo aqui os alcança.
     */
    termos: string[]
  }
> = {
  contabilidade: {
    rotulo: 'Contabilidade',
    descricao: 'Abertura de empresa, impostos, folha e obrigações contábeis.',
    // Contador e especialista fiscal atendem a mesma demanda do ponto de vista
    // de quem pede orçamento. Deixar o especialista fiscal de fora esconderia
    // dele metade do trabalho da própria área.
    tiposProfissionais: ['contabilidade', 'especialista_fiscal'],
    especialidades: ESPECIALIDADES_POR_CATEGORIA.contabilidade,
    termos: [
      'contab',
      'fiscal',
      'tribut',
      'folha de pagamento',
      'imposto',
      'departamento pessoal',
      'escrita',
    ],
  },
  advocacia: {
    rotulo: 'Jurídico - Advogado',
    descricao: 'Contratos, processos e orientação jurídica.',
    // Habilitação regulamentada: só quem declarou advocacia no cadastro.
    tiposProfissionais: ['advocacia'],
    especialidades: ESPECIALIDADES_POR_CATEGORIA.advocacia,
    termos: [
      'jurid',
      'jurí',
      'advoc',
      'direito',
      'trabalhista',
      'contencioso',
      'litig',
    ],
  },
}

/**
 * Categoria pública → categoria do Atendimento.
 *
 * O Atendimento tem vocabulário próprio (`contabil`, `juridico`, `fiscal`…),
 * herdado do catálogo de serviços, e ele não muda por causa das Oportunidades:
 * traduzir aqui é mais honesto do que gravar `contabilidade` numa coluna onde
 * todo o resto da plataforma grava `contabil` e depois pedir a cada tela que
 * aceite as duas grafias.
 */
export const CATEGORIA_ATENDIMENTO_DA_OPORTUNIDADE: Record<
  CategoriaOportunidade,
  string
> = {
  contabilidade: 'contabil',
  advocacia: 'juridico',
}

/** Categoria pública → área do registro na carteira (`AREAS_CLIENTE`). */
export const AREA_CARTEIRA_DA_OPORTUNIDADE: Record<
  CategoriaOportunidade,
  'contabil' | 'juridico'
> = {
  contabilidade: 'contabil',
  advocacia: 'juridico',
}

export function rotuloDaCategoria(categoria: string) {
  return (
    CATEGORIA_OPORTUNIDADE[categoria as CategoriaOportunidade]?.rotulo ??
    categoria
  )
}

export function categoriaValida(valor: string): valor is CategoriaOportunidade {
  return (CATEGORIAS_OPORTUNIDADE as readonly string[]).includes(valor)
}

/** As especialidades oferecidas numa categoria pública. */
export function especialidadesDaCategoria(categoria: CategoriaOportunidade) {
  return CATEGORIA_OPORTUNIDADE[categoria].especialidades
}

export const STATUS_OPORTUNIDADE = ['aberta', 'encerrada', 'cancelada'] as const
export type StatusOportunidade = (typeof STATUS_OPORTUNIDADE)[number]

export const ROTULO_STATUS_OPORTUNIDADE: Record<string, string> = {
  aberta: 'Aberta',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

/** Estados da proposta. Só o primeiro é alcançável nesta versão. */
export const STATUS_PROPOSTA = ['enviada'] as const
export type StatusProposta = (typeof STATUS_PROPOSTA)[number]

/**
 * Teto da lista carregada de uma vez.
 *
 * A vitrine de oportunidades é uma fila de trabalho, não um arquivo histórico.
 */
export const LIMITE_OPORTUNIDADES_CARREGADAS = 30

/**
 * Teto de caracteres da descrição.
 *
 * Mesmo teto que a descrição detalhada do serviço já usa no catálogo — é o
 * padrão do projeto para "texto longo que alguém vai ler inteiro", e reaproveitá-lo
 * evita que cada tela invente o seu.
 */
export const LIMITE_DESCRICAO_OPORTUNIDADE = 2000

/**
 * Teto de anexos por solicitação.
 *
 * Regra **provisória**: o projeto não tinha limite de quantidade (o Atendimento
 * anexa um arquivo por vez, sem teto por protocolo) e o produto ainda não
 * definiu um. Cinco cobre o caso real — contrato social, dois comprovantes, uma
 * foto de tela — sem deixar um formulário público aberto a lote ilimitado, que
 * é custo de storage e superfície de abuso. Tamanho e tipos seguem o padrão
 * existente, sem número inventado.
 */
export const LIMITE_ANEXOS_OPORTUNIDADE = 5

/**
 * Teto da **mensagem da proposta**.
 *
 * Bem menor que a descrição da solicitação (2.000) de propósito: o Cliente
 * descreve um problema que ainda não sabe nomear e precisa de espaço; o
 * prestador responde a um problema já descrito, e a tela do Cliente existe para
 * comparar várias respostas lado a lado. Quinhentos caracteres cabem numa
 * leitura só — que é o que faz a comparação acontecer.
 *
 * O teto vale para o que é **escrito de agora em diante**. Propostas gravadas
 * sob o limite anterior continuam íntegras e legíveis: nada é truncado na
 * leitura e nenhuma migração reescreveu texto. Só uma revisão da proposta
 * passa pela validação nova.
 */
export const LIMITE_MENSAGEM_PROPOSTA = 500

/** Teto da mensagem que acompanha a contraproposta. */
export const LIMITE_MENSAGEM_CONTRAPROPOSTA = 500

export { ESPECIALIDADES_POR_CATEGORIA }
