import { z } from 'zod'
import {
  ESTILOS_CARD_HOME,
  LIMITES_CARD_HOME,
  rotaInternaPermitida,
  TIPOS_DESTINO_CARD_HOME,
} from './constantes'

/**
 * Validação dos Cards da Home. O mesmo schema valida o formulário (cliente) e
 * a action (servidor) — a do servidor é a que vale.
 *
 * Os textos são texto puro: o React escapa na exibição, e aqui saem os
 * caracteres de controle (exceto a quebra de linha do título), que não têm
 * lugar num card e poderiam esconder conteúdo.
 */

/** Remove caracteres de controle e normaliza fim de linha. */
function limparTexto(valor: string, permitirQuebra: boolean) {
  const normalizado = valor.replace(/\r\n?/g, '\n')
  // eslint-disable-next-line no-control-regex
  const semControle = normalizado.replace(permitirQuebra ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
  return permitirQuebra
    ? semControle
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean)
        .join('\n')
    : semControle.trim()
}

const textoObrigatorio = (rotulo: string, limite: number) =>
  z
    .string()
    .transform((valor) => limparTexto(valor, false))
    .pipe(
      z
        .string()
        .min(1, `Informe ${rotulo}.`)
        .max(limite, `Use no máximo ${limite} caracteres.`),
    )

const idSchema = (rotulo: string) => z.string().uuid(`${rotulo} inválido(a).`)

const camposCard = {
  selo: z
    .string()
    .nullable()
    .optional()
    .transform((valor) => (valor ? limparTexto(valor, false) : ''))
    .pipe(z.string().max(LIMITES_CARD_HOME.selo, `Use no máximo ${LIMITES_CARD_HOME.selo} caracteres.`))
    .transform((valor) => valor || null),
  titulo: z
    .string()
    .transform((valor) => limparTexto(valor, true))
    .pipe(
      z
        .string()
        .min(1, 'Informe o título.')
        .max(LIMITES_CARD_HOME.titulo, `Use no máximo ${LIMITES_CARD_HOME.titulo} caracteres.`)
        .refine(
          (valor) => valor.split('\n').length <= LIMITES_CARD_HOME.linhasTitulo,
          `Use no máximo ${LIMITES_CARD_HOME.linhasTitulo} linhas no título.`,
        ),
    ),
  descricao: textoObrigatorio('a descrição', LIMITES_CARD_HOME.descricao),
  textoBotao: textoObrigatorio('o texto do botão', LIMITES_CARD_HOME.textoBotao),
  estilo: z.enum(ESTILOS_CARD_HOME, { message: 'Escolha um dos estilos disponíveis.' }),
  destinoTipo: z.enum(TIPOS_DESTINO_CARD_HOME, { message: 'Escolha o tipo de destino.' }),
  paginaId: idSchema('Página').nullable().optional().transform((valor) => valor ?? null),
  rota: z
    .string()
    .max(LIMITES_CARD_HOME.rota)
    .nullable()
    .optional()
    .transform((valor) => valor || null),
  ativo: z.boolean().default(false),
}

/**
 * Exatamente um destino, coerente com o tipo. A rota só vale se estiver no
 * catálogo fechado; a página é conferida no banco pela action (precisa estar
 * publicada).
 */
function destinoCoerente<
  T extends { destinoTipo: 'pagina' | 'rota'; paginaId: string | null; rota: string | null },
>(card: T, contexto: z.RefinementCtx) {
  if (card.destinoTipo === 'pagina') {
    if (!card.paginaId)
      contexto.addIssue({ code: 'custom', path: ['paginaId'], message: 'Escolha a página de destino.' })
  } else if (!card.rota || !rotaInternaPermitida(card.rota)) {
    contexto.addIssue({ code: 'custom', path: ['rota'], message: 'Escolha uma rota da lista.' })
  }
}

/** Mantém só o campo do tipo escolhido — o banco exige o outro nulo. */
function soDestinoDoTipo<
  T extends { destinoTipo: 'pagina' | 'rota'; paginaId: string | null; rota: string | null },
>(card: T): T {
  return card.destinoTipo === 'pagina' ? { ...card, rota: null } : { ...card, paginaId: null }
}

const listaSemRepeticao = z
  .array(idSchema('Card'))
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, 'A ordenação repete cards.')

export const schemasCardsHome = {
  criarCard: z.object(camposCard).superRefine(destinoCoerente).transform(soDestinoDoTipo),
  editarCard: z
    .object({ cardId: idSchema('Card'), ...camposCard })
    .superRefine(destinoCoerente)
    .transform(soDestinoDoTipo),
  alterarAtivacao: z.object({ cardId: idSchema('Card'), ativo: z.boolean() }),
  /** `confirmacao` precisa vir explícita: a exclusão nunca sai de um clique só. */
  excluirCard: z.object({
    cardId: idSchema('Card'),
    confirmacao: z.literal(true, { message: 'Confirme a exclusão.' }),
  }),
  reordenar: z.object({ idsOrdenados: listaSemRepeticao }),
}
