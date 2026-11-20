import { after } from 'next/server'

/**
 * Executa uma tarefa DEPOIS de a resposta sair (`after` do Next): o tempo de
 * resposta fica igual exista a conta ou não — chamar o provedor de e-mail/SMS
 * só para contas reais denunciaria quem existe. Fora de uma requisição (testes,
 * scripts) não há "depois": a tarefa roda na hora.
 */
export async function executarAposResposta(tarefa: () => Promise<void>): Promise<void> {
  try {
    after(tarefa)
  } catch {
    await tarefa()
  }
}
