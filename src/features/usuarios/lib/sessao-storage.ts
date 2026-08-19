const STORAGE_KEY = 'vincis_sessao'

type DadosSessaoSalva = {
  token: string
  expiraEm: string
}

export function salvarSessao(token: string, expiraEm: Date): void {
  const dados: DadosSessaoSalva = {
    token,
    expiraEm: expiraEm.toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados))
}

export function recuperarSessao(): { token: string; expiraEm: Date } | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    const dados: DadosSessaoSalva = JSON.parse(raw)
    const expiraEm = new Date(dados.expiraEm)
    if (isNaN(expiraEm.getTime())) return null
    return { token: dados.token, expiraEm }
  } catch {
    return null
  }
}

export function removerSessao(): void {
  localStorage.removeItem(STORAGE_KEY)
}
