/**
 * A intenção de contratar um serviço, guardada durante o login.
 *
 * O mesmo mecanismo da Consultoria Agendada (`consultorias/lib/
 * contexto-contratacao.ts`): `sessionStorage` — nunca a URL, que vaza o recado
 * do Cliente para histórico, log e `Referer` —, funções puras que recebem o
 * `Storage`, e leitura desconfiada: nada daqui autoriza nada; o servidor
 * reconfere serviço, preço e Profissional antes de qualquer cobrança.
 */

const CHAVE = 'vincis_servico_contratacao'

export type IntencaoDeServico = {
  prestadorId: string
  servicoId: string
  /** O recado que o Cliente já tinha escrito. */
  mensagem: string
}

export function salvarIntencao(storage: Storage, intencao: IntencaoDeServico): void {
  try {
    storage.setItem(CHAVE, JSON.stringify(intencao))
  } catch {
    // Storage bloqueado: perder o rascunho é ruim, quebrar o fluxo é pior.
  }
}

export function lerIntencao(storage: Storage): IntencaoDeServico | null {
  let bruto: string | null = null
  try {
    bruto = storage.getItem(CHAVE)
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const dados = JSON.parse(bruto) as Partial<IntencaoDeServico>
    if (
      typeof dados.prestadorId !== 'string' ||
      typeof dados.servicoId !== 'string' ||
      typeof dados.mensagem !== 'string'
    ) {
      return null
    }
    return { prestadorId: dados.prestadorId, servicoId: dados.servicoId, mensagem: dados.mensagem }
  } catch {
    return null
  }
}

export function limparIntencao(storage: Storage): void {
  try {
    storage.removeItem(CHAVE)
  } catch {
    // Mesmo motivo do `salvarIntencao`.
  }
}

/** A intenção é deste Profissional? Outro perfil não reabre o serviço errado. */
export function intencaoDoPrestador(
  intencao: IntencaoDeServico | null,
  prestadorId: string,
): IntencaoDeServico | null {
  return intencao?.prestadorId === prestadorId ? intencao : null
}

/** `sessionStorage` não existe no servidor nem em aba com storage bloqueado. */
export function obterStorageDaSessao(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}
