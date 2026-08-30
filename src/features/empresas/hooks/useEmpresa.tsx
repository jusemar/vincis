'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TelaCarregandoEspaco } from '@/components/shared/TelaCarregandoEspaco'
import { useAuth } from '@/features/usuarios'
import { ehPessoaProfissional } from '@/features/usuarios/lib/tipos-pessoa'
import { obterContextoEmpresa } from '../actions/obter-contexto-empresa'
import { telaDoEspaco } from '../lib/tela-do-espaco'
import { OnboardingEmpresa } from '../components/OnboardingEmpresa'
import type {
  ContextoEmpresa,
  ContextoProfissional,
  EstadoContextoEmpresa,
} from '../types'

type EmpresaContextType = {
  contexto: ContextoEmpresa | null
  contextoProfissional: ContextoProfissional | null
  recarregarContexto: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { estaAutenticado, estaCarregando, tokenSessao, usuario } = useAuth()
  const [contexto, setContexto] = useState<ContextoEmpresa | null>(null)
  const [contextoProfissional, setContextoProfissional] =
    useState<ContextoProfissional | null>(null)
  const [estado, setEstado] = useState<EstadoContextoEmpresa>('sem_tenant')
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [tokenContexto, setTokenContexto] = useState<string | null>(null)

  const carregarContexto = useCallback(async () => {
    if (!tokenSessao) return

    try {
      const resultado = await obterContextoEmpresa(tokenSessao)
      setContexto(resultado.contexto ?? null)
      setContextoProfissional(resultado.contextoProfissional ?? null)
      setEstado(resultado.estado)
      setMensagem(resultado.mensagem)
      setTokenContexto(tokenSessao)
    } catch {
      setContexto(null)
      setContextoProfissional(null)
      setEstado('erro')
      setMensagem('Não foi possível consultar sua empresa. Tente novamente.')
      setTokenContexto(tokenSessao)
    }
  }, [tokenSessao])

  const recarregarContexto = useCallback(async () => {
    setCarregando(true)
    await carregarContexto()
    setCarregando(false)
  }, [carregarContexto])

  useEffect(() => {
    // O Gestor da Plataforma passa por aqui como qualquer outra conta: ele pode
    // ter escritório, e é o servidor que diz em que estado ele está.
    if (estaCarregando || !estaAutenticado || !tokenSessao) return

    let cancelado = false

    obterContextoEmpresa(tokenSessao).then(
      (resultado) => {
        if (cancelado) return
        setContexto(resultado.contexto ?? null)
        setContextoProfissional(resultado.contextoProfissional ?? null)
        setEstado(resultado.estado)
        setMensagem(resultado.mensagem)
        setTokenContexto(tokenSessao)
      },
      () => {
        if (cancelado) return
        setContexto(null)
        setContextoProfissional(null)
        setEstado('erro')
        setMensagem('Não foi possível consultar sua empresa. Tente novamente.')
        setTokenContexto(tokenSessao)
      },
    )

    return () => {
      cancelado = true
    }
  }, [estaAutenticado, estaCarregando, pathname, tokenSessao])

  function concluirOnboarding(novoContexto: ContextoEmpresa) {
    setContexto(novoContexto)
    setEstado('ativo')
    router.replace('/admin')
    router.refresh()
  }

  const estaNaAreaAdministrativa = pathname.startsWith('/admin')
  // Mesma regra de tipo usada no servidor, sem duplicar a lista de perfis.
  const perfilProfissional = usuario
    ? ehPessoaProfissional(usuario.perfilTipo)
    : false

  // Uma regra só, escrita fora da renderização, decide o que a área
  // administrativa mostra. `colaborador` é estado final válido: o Colaborador
  // opera no painel sem escritório próprio.
  const tela = telaDoEspaco({
    naAreaAdministrativa: estaNaAreaAdministrativa,
    autenticacaoCarregando: estaCarregando,
    autenticado: estaAutenticado,
    contextoCarregando: carregando,
    contextoAtualizado: tokenContexto === tokenSessao,
    perfilProfissional,
    estadoContexto: estado,
  })

  if (tela === 'carregando') {
    return <TelaCarregandoEspaco />
  }

  if (tela === 'onboarding') {
    return <OnboardingEmpresa onConcluido={concluirOnboarding} />
  }

  if (tela === 'erro') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="px-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </div>
            <h1 className="mt-5 font-serif text-2xl font-semibold">
              Não foi possível abrir seu espaço
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {mensagem || 'Atualize o contexto da empresa para continuar.'}
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => void recarregarContexto()}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <EmpresaContext.Provider
      value={{ contexto, contextoProfissional, recarregarContexto }}
    >
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa(): EmpresaContextType {
  const context = useContext(EmpresaContext)
  if (!context) {
    throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider')
  }
  return context
}
