import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { AuthContextType, DadosUsuarioAutenticado, ResultadoLogin, ResultadoPadrao } from '../types'
import type { LoginDTO } from '../schemas/login'
import { recuperarSessao, salvarSessao, removerSessao } from '../lib/sessao-storage'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<DadosUsuarioAutenticado | null>(null)
  const [tokenSessao, setTokenSessao] = useState<string | null>(null)
  const [estaCarregando, setEstaCarregando] = useState(true)

  useEffect(() => {
    const init = async () => {
      const sessaoSalva = recuperarSessao()
      if (sessaoSalva) {
        setTokenSessao(sessaoSalva.token)
        try {
          const res = await fetch(`/api/auth/sessao?token=${sessaoSalva.token}`)
          const data = await res.json()
          if (data.sucesso && data.dados?.usuario) {
            setUsuario(data.dados.usuario)
          } else {
            removerSessao()
            setTokenSessao(null)
          }
        } catch {
          removerSessao()
          setTokenSessao(null)
        }
      }
      setEstaCarregando(false)
    }
    init()
  }, [])

  const refreshSession = useCallback(async () => {
    const sessaoSalva = recuperarSessao()
    if (!sessaoSalva) {
      setUsuario(null)
      setTokenSessao(null)
      return
    }
    setTokenSessao(sessaoSalva.token)
    try {
      const res = await fetch(`/api/auth/sessao?token=${sessaoSalva.token}`)
      const data = await res.json()
      if (data.sucesso && data.dados?.usuario) {
        setUsuario(data.dados.usuario)
      } else {
        removerSessao()
        setUsuario(null)
        setTokenSessao(null)
      }
    } catch {
      removerSessao()
      setUsuario(null)
      setTokenSessao(null)
    }
  }, [])

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
