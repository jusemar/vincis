import { z } from 'zod'
import { ABRANGENCIAS } from '../constants/abrangencia'
import {
  CATEGORIAS_OPORTUNIDADE,
  LIMITE_ANEXOS_OPORTUNIDADE,
  LIMITE_DESCRICAO_OPORTUNIDADE,
  LIMITE_MENSAGEM_CONTRAPROPOSTA,
  LIMITE_MENSAGEM_PROPOSTA,
  especialidadesDaCategoria,
} from '../constants/oportunidade'
import { VALIDADES_PROPOSTA, VALIDADE_PADRAO_HORAS } from '../lib/vigencia'

/**
 * Aceita "1.234,56" e "1234.56"; devolve centavos.
 *
 * Devolve `null` para vazio (não informado) e `0` para o que foi digitado mas
 * não é um valor positivo — os dois casos são diferentes e quem chama precisa
 * distingui-los: vazio é legítimo, "0" ou "-50" é erro de preenchimento e não
 * pode virar "não informado" em silêncio.
 */
export function converterValorParaCentavos(
  valor: string | undefined | null,
): number | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  const limpo = texto
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const numero = Number.parseFloat(limpo)
  if (!Number.isFinite(numero) || numero <= 0) return 0
  return Math.round(numero * 100)
}

/**
 * Solicitação de orçamento, como o Cliente a envia.
 *
 * Obrigatórios são apenas categoria, descrição e abrangência — o propósito da
 * etapa é atender quem **ainda não sabe** o que pedir a quem, e cada campo
 * obrigatório a mais filtra justamente essa pessoa. Especialidades, valor
 * pretendido e anexos são opcionais.
 *
 * `destinatarioId` é o que separa as duas portas de entrada, e é só isso: com
 * ele, a solicitação nasce privada e dirigida àquele Profissional; sem ele,
 * nasce pública como sempre. O schema apenas confere que é um uuid — **quem** é
 * essa pessoa, se ela pode operar e se a categoria é compatível com o cadastro
 * dela são perguntas para o banco, e a action as faz antes de gravar.
 */
export const NovaOportunidadeSchema = z
  .object({
    categoria: z.enum(CATEGORIAS_OPORTUNIDADE, {
      message: 'Escolha a categoria da sua necessidade.',
    }),
    /**
     * Vocabulário fechado, conferido contra a categoria escolhida no
     * `superRefine`. Sem isso, qualquer texto entraria na oportunidade por
     * chamada direta e apareceria como se fosse taxonomia da plataforma.
     */
    especialidades: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    descricao: z
      .string()
      .trim()
      .min(20, 'Descreva sua necessidade com pelo menos 20 caracteres.')
      .max(
        LIMITE_DESCRICAO_OPORTUNIDADE,
        `A descrição deve ter no máximo ${LIMITE_DESCRICAO_OPORTUNIDADE} caracteres.`,
      ),
    abrangencia: z.enum(ABRANGENCIAS, {
      message: 'Escolha BR ou a UF do atendimento.',
    }),
    /** Texto livre em reais; convertido em centavos no servidor. */
    valorPretendido: z.string().trim().max(20).optional().default(''),
    /** Profissional escolhido. Ausente = solicitação pública. */
    destinatarioId: z
      .string()
      .uuid('Profissional inválido.')
      .optional(),
  })
  .superRefine((dados, ctx) => {
    // Vocabulário fechado **da categoria pública escolhida**: uma especialidade
    // jurídica enviada junto de uma solicitação contábil é recusada aqui, e não
    // só escondida na tela.
    const permitidas = especialidadesDaCategoria(dados.categoria)
    const invalida = dados.especialidades.find(
      (item) => !permitidas.includes(item),
    )
    if (invalida) {
      ctx.addIssue({
        code: 'custom',
        path: ['especialidades'],
        message: 'Escolha apenas especialidades desta categoria.',
      })
    }
    const repetidas = new Set(dados.especialidades).size !== dados.especialidades.length
    if (repetidas) {
      ctx.addIssue({
        code: 'custom',
        path: ['especialidades'],
        message: 'Especialidade repetida.',
      })
    }
    // Vazio é legítimo; digitado precisa ser um valor de verdade. Zero e
    // negativo são recusados em vez de virarem "não informado".
    if (converterValorParaCentavos(dados.valorPretendido) === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['valorPretendido'],
        message: 'Informe um valor maior que zero ou deixe o campo em branco.',
      })
    }
  })

export type NovaOportunidadeDTO = z.input<typeof NovaOportunidadeSchema>

/**
 * Lê a solicitação de um `FormData`.
 *
 * O formulário envia arquivos junto, então a action recebe `FormData` e não um
 * objeto — é o mesmo caminho que o anexo de Atendimento já usa. A conversão
 * fica aqui, ao lado do schema, para que a action não precise conhecer nomes de
 * campo do HTML.
 */
export function lerNovaOportunidade(formData: FormData) {
  return NovaOportunidadeSchema.safeParse({
    categoria: formData.get('categoria'),
    especialidades: formData.getAll('especialidades').map(String),
    descricao: formData.get('descricao'),
    abrangencia: formData.get('abrangencia'),
    valorPretendido: formData.get('valorPretendido') ?? '',
    // Campo ausente e campo vazio significam a mesma coisa aqui: pública.
    destinatarioId: formData.get('destinatarioId')?.toString() || undefined,
  })
}

/** Os anexos enviados no formulário, já limitados em quantidade. */
export function lerAnexosDaOportunidade(formData: FormData) {
  const arquivos = formData
    .getAll('anexos')
    .filter((item): item is File => item instanceof File && item.size > 0)

  if (arquivos.length > LIMITE_ANEXOS_OPORTUNIDADE) {
    return {
      sucesso: false as const,
      mensagem: `Envie no máximo ${LIMITE_ANEXOS_OPORTUNIDADE} arquivos.`,
    }
  }
  return { sucesso: true as const, arquivos }
}

/**
 * Proposta do prestador.
 *
 * Valor e prazo são opcionais de propósito: "a combinar" é uma resposta
 * legítima nesta fase, e obrigar um número faria o prestador inventar um só
 * para conseguir responder. O que não é opcional é a mensagem — é ela que o
 * Cliente lê para decidir.
 *
 * O teto da mensagem vale para o que está sendo escrito **agora**. Propostas
 * gravadas quando o limite era maior não são migradas, truncadas nem
 * bloqueadas na leitura: elas seguem exibidas por inteiro. Só uma revisão da
 * proposta — que reescreve o texto — passa por esta validação.
 */
export const NovaPropostaSchema = z.object({
  oportunidadeId: z.string().uuid('Oportunidade inválida.'),
  mensagem: z
    .string()
    .trim()
    .min(20, 'Escreva ao menos 20 caracteres explicando sua proposta.')
    .max(
      LIMITE_MENSAGEM_PROPOSTA,
      `A mensagem da proposta deve ter no máximo ${LIMITE_MENSAGEM_PROPOSTA} caracteres.`,
    ),
  valor: z.string().trim().max(20).optional().default(''),
  prazoEstimadoDias: z.coerce
    .number()
    .int()
    .min(0)
    .max(365, 'Informe um prazo de até 365 dias.')
    .optional(),
  /** Validade comercial escolhida pelo prestador, em horas. */
  validadeHoras: z.coerce
    .number()
    .int()
    .refine(
      (valor) => VALIDADES_PROPOSTA.some((opcao) => opcao.horas === valor),
      'Escolha uma validade oferecida.',
    )
    .optional()
    .default(VALIDADE_PADRAO_HORAS),
})

/**
 * Contraproposta do Cliente.
 *
 * O valor é obrigatório e maior que zero — contraproposta sem número é recado,
 * e recado não muda o preço de nada. A mensagem é opcional e curta: ela explica
 * o número, não substitui a mensagem da proposta.
 */
export const ContrapropostaSchema = z.object({
  propostaId: z.string().uuid('Proposta inválida.'),
  valor: z.string().trim().min(1, 'Informe o valor da sua contraproposta.'),
  mensagem: z
    .string()
    .trim()
    .max(
      LIMITE_MENSAGEM_CONTRAPROPOSTA,
      `A mensagem deve ter no máximo ${LIMITE_MENSAGEM_CONTRAPROPOSTA} caracteres.`,
    )
    .optional()
    .default(''),
})

export const RespostaContrapropostaSchema = z.object({
  contrapropostaId: z.string().uuid('Contraproposta inválida.'),
  decisao: z.enum(['aceitar', 'recusar']),
})

export const PropostaIdSchema = z.object({
  propostaId: z.string().uuid('Proposta inválida.'),
})

export type NovaPropostaDTO = z.input<typeof NovaPropostaSchema>

export const OportunidadeIdSchema = z.object({
  oportunidadeId: z.string().uuid('Oportunidade inválida.'),
})
