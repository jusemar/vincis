import { timingSafeEqual } from 'node:crypto'

/**
 * Nome da variável que autentica o agendador.
 *
 * `CRON_SECRET` é o nome que a própria Vercel usa: quando ela existe no
 * projeto, o Vercel Cron passa a enviar `Authorization: Bearer <valor>` em toda
 * chamada agendada, sem nenhum código nosso. Escolher outro nome significaria
 * montar esse cabeçalho à mão e perder essa integração de graça.
 */
export const NOME_VARIAVEL_CRON = 'CRON_SECRET'

export type ResultadoAutorizacaoCron =
  | { autorizado: true }
  | { autorizado: false; motivo: 'sem-configuracao' | 'credencial-invalida' }

/** Comparação de tempo constante — evita distinguir segredos pelo tempo de resposta. */
function iguais(a: string, b: string) {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Quem pode disparar a varredura temporal.
 *
 * Uma porta só: o cabeçalho `Authorization: Bearer <CRON_SECRET>`. Sessão de
 * usuário **não** abre esta rota, nem a de Gestor — a varredura não é uma ação
 * de produto que alguém executa, é infraestrutura, e dar a ela uma segunda porta
 * de entrada seria criar uma superfície que ninguém audita.
 *
 * Sem a variável configurada, a rota **recusa** em vez de liberar. Um segredo
 * ausente é uma configuração incompleta, não uma permissão implícita: o modo
 * inseguro nunca pode ser o padrão de quem esqueceu de configurar.
 *
 * O valor nunca é logado, nunca volta na resposta e nunca aparece na mensagem
 * de erro — a recusa diz apenas que não foi autorizada.
 */
export function autorizarCron(
  cabecalhoAuthorization: string | null,
): ResultadoAutorizacaoCron {
  const segredo = process.env[NOME_VARIAVEL_CRON]
  if (!segredo) return { autorizado: false, motivo: 'sem-configuracao' }

  const prefixo = 'Bearer '
  if (!cabecalhoAuthorization?.startsWith(prefixo)) {
    return { autorizado: false, motivo: 'credencial-invalida' }
  }

  const enviado = cabecalhoAuthorization.slice(prefixo.length)
  return iguais(enviado, segredo)
    ? { autorizado: true }
    : { autorizado: false, motivo: 'credencial-invalida' }
}
