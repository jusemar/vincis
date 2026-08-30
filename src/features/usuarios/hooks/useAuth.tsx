import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { AuthContextType, DadosUsuarioAutenticado, ResultadoLogin, ResultadoPadrao } from '../types'
import type { LoginDTO } from '../schemas/login'
import { recuperarSessao, salvarSessao, removerSessao } from '../lib/sessao-storage'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Uma sessão inválida e uma rede fora do ar não são a mesma coisa.
 *
 * O servidor responde 401 ou 403 quando o token não vale mais — aí a sessão
 * guardada é lixo e sai. Qualquer outra falha (servidor sem resposta, 500,
 * conexão caindo no meio) diz apenas que **não foi possível conferir**, e
 * apagar a sessão nesse caso desloga quem estava legitimamente autenticado por
 * causa de um soluço de rede. Este tipo separa os dois desfechos para que o
 * segundo vire um estado com botão de tentar de novo.
 */
type ConferenciaDaSessao =
  | { situacao: 'valida'; usuario: DadosUsuarioAutenticado }
  | { situacao: 'invalida' }
  | { situacao: 'indisponivel' }

async function conferirSessao(token: string): Promise<ConferenciaDaSessao> {
  try {
    const res = await fetch(`/api/auth/sessao?token=${token}`)
    if (res.status === 401 || res.status === 403) return { situacao: 'invalida' }
    if (!res.ok) return { situacao: 'indisponivel' }

    const data = await res.json()
    return data?.sucesso && data?.dados?.usuario
      ? { situacao: 'valida', usuario: data.dados.usuario }
      : { situacao: 'invalida' }
  } catch {
    return { situacao: 'indisponivel' }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<DadosUsuarioAutenticado | null>(null)
  const [tokenSessao, setTokenSessao] = useState<string | null>(null)
  const [estaCarregando, setEstaCarregando] = useState(true)
  const [erroSessao, setErroSessao] = useState(false)

  /**
   * Aplica o desfecho da conferência. Só a resposta explícita do servidor
   * apaga a sessão guardada.
   */
  const aplicarConferencia = useCallback((resultado: ConferenciaDaSessao) => {
    if (resultado.situacao === 'valida') {
      setUsuario(resultado.usuario)
      setErroSessao(false)
      return
    }
    if (resultado.situacao === 'invalida') {
      removerSessao()
      setUsuario(null)
      setTokenSessao(null)
      setErroSessao(false)
      return
    }
    setUsuario(null)
    setErroSessao(true)
  }, [])

  useEffect(() => {
    let cancelado = false

    const init = async () => {
      try {
        // `recuperarSessao` toca o localStorage, que **lança** em janela
        // anônima e em navegadores com dados de site bloqueados. Sem este
        // `try`, a exceção escapava para uma promessa que ninguém observava e
        // o `finally` abaixo nunca acontecia: a aplicação inteira ficava
        // carregando para sempre, sem erro nenhum no console do servidor.
        const sessaoSalva = recuperarSessao()
        if (!sessaoSalva) return

        setTokenSessao(sessaoSalva.token)
        const resultado = await conferirSessao(sessaoSalva.token)
        if (!cancelado) aplicarConferencia(resultado)
      } finally {
        // O carregamento termina em toda saída possível desta função. É a
        // única garantia que impede uma tela de espera sem fim.
        if (!cancelado) setEstaCarregando(false)
      }
    }

    void init()
    return () => {
      cancelado = true
    }
  }, [aplicarConferencia])

  const refreshSession = useCallback(async () => {
    let sessaoSalva: ReturnType<typeof recuperarSessao> = null
    try {
      sessaoSalva = recuperarSessao()
    } catch {
      sessaoSalva = null
    }

    if (!sessaoSalva) {
      setUsuario(null)
      setTokenSessao(null)
      setErroSessao(false)
      return
    }

    setTokenSessao(sessaoSalva.token)
    aplicarConferencia(await conferirSessao(sessaoSalva.token))
  }, [aplicarConferencia])

  const login = useCallback(async (dados: LoginDTO): Promise<ResultadoLogin> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      const data = await res.json()
      if (data.sucesso && data.dados) {
        setUsuario(data.dados.usuario)
        setTokenSessao(data.dados.tokenSessao)
        setErroSessao(false)
        salvarSessao(data.dados.tokenSessao, new Date(data.dados.expiraEm))
        return {
          sucesso: true,
          mensagem: data.mensagem,
          usuario: data.dados.usuario,
          destino: data.dados.destino,
        }
      }
      return {
        sucesso: false,
        mensagem: data.mensagem || 'Credenciais inválidas',
      }
    } catch {
      return {
        sucesso: false,
        mensagem: 'Erro de conexão. Tente novamente.',
      }
    }
  }, [])

  const logout = useCallback(async (): Promise<ResultadoPadrao> => {
    try {
      if (tokenSessao) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenSessao }),
        })
      }
    } catch {
      // falha no servidor não impede logout local
    }
    removerSessao()
    setUsuario(null)
    setTokenSessao(null)
    setErroSessao(false)
    return {
      sucesso: true,
      mensagem: 'Sessão encerrada',
    }
  }, [tokenSessao])

  const estaAutenticado = usuario !== null && tokenSessao !== null

  return (
    <AuthContext.Provider
      value={{
        usuario,
        tokenSessao,
        estaCarregando,
        estaAutenticado,
        erroSessao,
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
