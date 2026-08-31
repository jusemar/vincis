/**
 * O registro técnico da Precificação, com um vocabulário fixo.
 *
 * Preço é a coisa que mais precisa de rastro e a que menos pode vazar detalhe
 * para a tela: quando algo dá errado, o Gestor vê uma frase em português e o
 * servidor guarda o suficiente para alguém diagnosticar. Os prefixos são
 * fechados para que uma busca por `[PRECIFICACAO_` traga tudo, e nunca varie
 * de grafia entre um arquivo e outro.
 *
 * O que **não** entra aqui: senha, token, cabeçalho de sessão, e-mail,
 * telefone ou qualquer dado de pessoa. Identificar o autor é o papel da trilha
 * de auditoria, que guarda o id da conta na tabela própria; o log carrega
 * contexto técnico — seção, quantidades, código do erro.
 */
export const EVENTOS_PRECIFICACAO = {
  carregar: 'PRECIFICACAO_CARREGAR',
  validar: 'PRECIFICACAO_VALIDAR',
  salvar: 'PRECIFICACAO_SALVAR',
  conflito: 'PRECIFICACAO_CONFLITO',
  calculoFalhou: 'PRECIFICACAO_CALCULO_FALHOU',
} as const

export type EventoPrecificacao =
  (typeof EVENTOS_PRECIFICACAO)[keyof typeof EVENTOS_PRECIFICACAO]

type Contexto = Record<string, string | number | boolean | string[] | null>

function emitir(
  nivel: 'info' | 'warn' | 'error',
  evento: EventoPrecificacao,
  contexto: Contexto,
) {
  const linha = `[${evento}]`
  if (nivel === 'error') console.error(linha, contexto)
  else if (nivel === 'warn') console.warn(linha, contexto)
  else console.info(linha, contexto)
}

export function registrarInfo(evento: EventoPrecificacao, contexto: Contexto) {
  emitir('info', evento, contexto)
}

export function registrarAviso(evento: EventoPrecificacao, contexto: Contexto) {
  emitir('warn', evento, contexto)
}

export function registrarFalha(
  evento: EventoPrecificacao,
  contexto: Contexto,
  erro?: unknown,
) {
  emitir('error', evento, {
    ...contexto,
    // Só o essencial do erro: nome, código e mensagem. Nada de objeto cru, que
    // é por onde credencial de conexão costuma escapar para o log.
    erro: erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro ?? ''),
  })
}
