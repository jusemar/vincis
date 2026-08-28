import type { SelecaoDeConsultoria } from '../types/consultoria'

/**
 * O que o Cliente já tinha preenchido, guardado durante o login.
 *
 * ## Por que existe
 *
 * Quem escolhe o horário, escreve o assunto e só então descobre que precisa
 * entrar não pode perder o que escreveu. O caminho óbvio — mandar tudo na URL
 * de retorno — está descartado por escrito: o assunto de uma consultoria é
 * conteúdo sensível ("quero discutir a rescisão do meu contrato"), e URL vaza
 * para histórico do navegador, log de servidor, `Referer` e print de tela.
 *
 * ## Por que `sessionStorage`, e não banco
 *
 * Porque nada aqui precisa sobreviver à aba. É rascunho de formulário, não
 * registro: fica no navegador de quem digitou, nunca trafega, morre quando a
 * aba fecha e não cria tabela nova para um estado que dura trinta segundos.
 * Um `hold` de horário seria outra conversa — e não é esta etapa.
 *
 * ## Por que as funções são puras
 *
 * Recebem o `Storage` em vez de tocar `window`: assim os testes rodam sem DOM,
 * e o servidor nunca importa nada que dependa de `window` existir.
 */

const CHAVE = 'vincis_consultoria_contratacao'

/** O rascunho serializável. `Date` vira ISO — JSON não tem data. */
type ContextoSerializado = {
  selecao: Omit<SelecaoDeConsultoria, 'inicioEm' | 'fimEm'> & {
    inicioEm: string
    fimEm: string
  }
  descricao: string
}

export type ContextoDeContratacao = {
  selecao: SelecaoDeConsultoria
  descricao: string
}

export function salvarContexto(
  storage: Storage,
  contexto: ContextoDeContratacao,
): void {
  const { inicioEm, fimEm, ...resto } = contexto.selecao
  const dados: ContextoSerializado = {
    selecao: {
      ...resto,
      inicioEm: inicioEm.toISOString(),
      fimEm: fimEm.toISOString(),
    },
    descricao: contexto.descricao,
  }
  try {
    storage.setItem(CHAVE, JSON.stringify(dados))
  } catch {
    // Aba anônima com storage bloqueado, cota estourada: perder o rascunho é
    // ruim, quebrar o fluxo de contratação é pior.
  }
}

/**
 * Lê o rascunho de volta.
 *
 * Devolve `null` diante de qualquer coisa que não seja exatamente o que foi
 * gravado. O conteúdo vem do próprio navegador e pode ter sido editado à mão —
 * e nada aqui autoriza nada: mesmo restaurado, o servidor revalida Profissional,
 * horário, preço e duração antes de deixar avançar.
 */
export function lerContexto(storage: Storage): ContextoDeContratacao | null {
  let bruto: string | null = null
  try {
    bruto = storage.getItem(CHAVE)
  } catch {
    return null
  }
  if (!bruto) return null

  try {
    const dados = JSON.parse(bruto) as ContextoSerializado
    const inicioEm = new Date(dados.selecao.inicioEm)
    const fimEm = new Date(dados.selecao.fimEm)
    if (Number.isNaN(inicioEm.getTime()) || Number.isNaN(fimEm.getTime())) {
      return null
    }
    if (
      typeof dados.selecao.prestadorId !== 'string' ||
      typeof dados.selecao.data !== 'string' ||
      typeof dados.selecao.inicio !== 'string' ||
      typeof dados.descricao !== 'string'
    ) {
      return null
    }
    return {
      selecao: { ...dados.selecao, inicioEm, fimEm },
      descricao: dados.descricao,
    }
  } catch {
    return null
  }
}

export function limparContexto(storage: Storage): void {
  try {
    storage.removeItem(CHAVE)
  } catch {
    // Mesmo motivo do `salvarContexto`.
  }
}

/**
 * O rascunho é deste Profissional?
 *
 * Sem esta pergunta, abrir o perfil de outra pessoa depois de um login
 * interrompido reabriria o modal com a consultoria errada — o tipo de erro que
 * o Cliente só percebe depois de pagar.
 */
export function contextoDoPrestador(
  contexto: ContextoDeContratacao | null,
  prestadorId: string,
): ContextoDeContratacao | null {
  if (!contexto) return null
  return contexto.selecao.prestadorId === prestadorId ? contexto : null
}
