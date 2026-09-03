'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { violacoesComerciais } from '@/features/precificacao/lib/invariantes'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import {
  despublicarPrecos,
  publicarPrecos,
  salvarRascunhoDePrecos,
} from '../../actions/precificacao-profissional'
import { rotaDosPrecosDoProfissional } from '../../constants/precificacao-profissional'
import {
  paraNumero,
  rascunhoAlterado,
  rascunhoDosValores,
  valoresDoRascunho,
  type RascunhoDoProfissional,
} from '../../lib/rascunho'
import {
  primeiroNomeDe,
  tabelaDoProfissional,
} from '../../lib/tabela-do-profissional'
import type {
  ConfiguracaoDoProfissional,
  ResultadoDaGravacao,
} from '../../types/precificacao-profissional'
import { PlanosDoProfissional } from '../publico/PlanosDoProfissional'
import { SecoesDePreco } from './SecoesDePreco'

/**
 * Meus preços: configuração de um lado, prévia do outro.
 *
 * ## A prévia não é uma ilustração da tela pública — ela é a tela pública
 *
 * O painel monta a tabela hipotética com o que está digitado neste instante e
 * entrega ao **mesmo componente** que a página pública renderiza
 * (`PlanosDoProfissional`), que por sua vez chama o **mesmo motor** que
 * `/precos` chama. Não existe aqui nenhuma segunda fórmula, nenhum layout
 * paralelo e nenhuma aproximação: mudar R$ 180 para R$ 220 move o número da
 * direita porque o motor recalculou, não porque alguém copiou o valor.
 *
 * É o que responde à pergunta que antecede toda alteração de preço: "se eu
 * configurar assim, é exatamente isto que meu cliente vê?".
 *
 * ## O perfil de empresa da prévia é fictício, e continua onde está
 *
 * A prévia abre com o perfil padrão da plataforma e o Profissional pode mexer
 * nele à vontade — é a empresa imaginária dele. Alterar um preço à esquerda
 * **não** reinicia esse cenário: o que muda é o preço, e é justamente a
 * comparação "mesmo cenário, preço novo" que dá sentido à tela.
 *
 * ## Salvar e publicar são dois gestos
 *
 * Salvar guarda o rascunho e não move nada na página pública. Publicar promove
 * o que está na prévia. Enquanto não se publica, o cliente continua vendo a
 * versão anterior — e a tela diz isso, com todas as letras, em vez de deixar a
 * pessoa deduzir.
 */
export function MeusPrecosPage({
  configuracao,
  estrutura,
}: {
  configuracao: ConfiguracaoDoProfissional
  /** A grade da Vincis: rótulos, faixas e limites. Nenhum valor dela é usado. */
  estrutura: TabelaPrecificacao
}) {
  const router = useRouter()
  const [salvando, iniciarSalvamento] = useTransition()

  const salvo = useMemo(
    () => rascunhoDosValores(configuracao.rascunho),
    [configuracao.rascunho],
  )
  const [rascunho, setRascunho] = useState<RascunhoDoProfissional>(salvo)

  const primeiroNome = primeiroNomeDe(configuracao.nome)

  /** Os valores como ficariam se isto fosse salvo agora. Base da prévia. */
  const valoresSimulados = useMemo(
    () => valoresDoRascunho(rascunho, configuracao.rascunho),
    [rascunho, configuracao.rascunho],
  )

  const tabelaSimulada = useMemo(
    () => tabelaDoProfissional(estrutura, valoresSimulados, { primeiroNome }),
    [estrutura, valoresSimulados, primeiroNome],
  )

  /*
    A mesma conferência comercial do servidor, rodando no navegador.

    Não substitui a do servidor — a action confere de novo antes de gravar —,
    mas evita que a pessoa descubra o problema só depois de clicar em Publicar.
  */
  const alertas = useMemo(() => {
    try {
      return violacoesComerciais(tabelaSimulada)
    } catch {
      return []
    }
  }, [tabelaSimulada])

  const alterado = rascunhoAlterado(rascunho, salvo)
  const podeGravar = alertas.length === 0 && camposPreenchidos(rascunho)

  const [secaoComProblema, setSecaoComProblema] = useState<string | undefined>()

  const aoResponder = (resultado: ResultadoDaGravacao) => {
    setSecaoComProblema(resultado.sucesso ? undefined : resultado.secao)
    if (resultado.sucesso) {
      toast.success(resultado.mensagem)
      router.refresh()
    } else {
      toast.error(resultado.mensagem)
    }
  }

  const entrada = () => ({ valores: entradaDosCampos(rascunho) })

  const salvar = () =>
    iniciarSalvamento(async () => {
      aoResponder(await salvarRascunhoDePrecos(entrada()))
    })

  const publicar = () =>
    iniciarSalvamento(async () => {
      aoResponder(await publicarPrecos(entrada()))
    })

  const despublicar = () =>
    iniciarSalvamento(async () => {
      aoResponder(await despublicarPrecos())
    })

  /** Há diferença entre o que está na tela e o que o cliente vê agora? */
  const publicadoDesatualizado =
    configuracao.publicado &&
    JSON.stringify(valoresSimulados) !==
      JSON.stringify(configuracao.publicadoValores)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Meus preços
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Quanto você cobra por mês para cuidar da contabilidade de uma
            empresa. Estes valores são só seus — a tabela da Vincis segue
            separada e não muda com eles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {configuracao.publicado ? (
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" /> No ar
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <EyeOff className="size-3.5" /> Fora do ar
            </Badge>
          )}

          {configuracao.publicado ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={rotaDosPrecosDoProfissional(configuracao.profissionalId)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" /> Ver página pública
              </Link>
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={salvar}
            disabled={salvando || !alterado || !podeGravar}
          >
            {salvando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar rascunho
          </Button>

          <Button size="sm" onClick={publicar} disabled={salvando || !podeGravar}>
            {salvando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {configuracao.publicado ? 'Publicar alterações' : 'Publicar preços'}
          </Button>

          {configuracao.publicado ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={despublicar}
              disabled={salvando}
              className="text-muted-foreground"
            >
              <EyeOff className="size-4" /> Tirar do ar
            </Button>
          ) : null}
        </div>
      </header>

      {configuracao.novo ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Os campos abrem com os valores de referência da Vincis, apenas como
          ponto de partida. <strong className="text-foreground">Nada está
          gravado ainda</strong> — ajuste o que quiser e publique quando estiver
          do seu jeito.
        </p>
      ) : null}

      {publicadoDesatualizado ? (
        <p className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Você tem alterações que ainda não estão no ar. Seus clientes continuam
          vendo a última versão publicada até você clicar em{' '}
          <strong>Publicar alterações</strong>.
        </p>
      ) : null}

      {alertas.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" />
            {alertas.length === 1
              ? 'Um ponto impede a publicação'
              : `${alertas.length} pontos impedem a publicação`}
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {alertas.slice(0, 3).map((alerta) => (
              <li key={`${alerta.secao}-${alerta.campo ?? ''}-${alerta.mensagem}`}>
                {alerta.mensagem}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] xl:items-start">
        <div className="min-w-0">
          <SecoesDePreco
            estrutura={estrutura}
            rascunho={rascunho}
            onChange={setRascunho}
            secaoComProblema={secaoComProblema}
          />
        </div>

        <div className="min-w-0 xl:sticky xl:top-4">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="size-4 text-primary" /> Prévia · como seu cliente
              verá
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Empresa de exemplo, só para demonstração. Mexa nas respostas para
              simular perfis diferentes — nada aqui é salvo.
            </p>

            <div className="mt-4">
              <PlanosDoProfissional
                tabela={tabelaSimulada}
                nome={configuracao.nome}
                primeiroNome={primeiroNome}
                demonstracao
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Todo campo tem um número dentro?
 *
 * Um campo em branco não estraga a prévia (o rascunho usa o valor gravado no
 * lugar), mas gravar assim guardaria um valor que a pessoa não digitou. Enquanto
 * houver campo vazio, os dois botões ficam fora de alcance.
 */
function camposPreenchidos(rascunho: RascunhoDoProfissional): boolean {
  return [
    ...Object.values(rascunho.precosBase),
    ...Object.values(rascunho.faixas),
    // Só o campo que o seletor deixou em cena. O outro guarda um valor que a
    // pessoa não está usando, e exigi-lo travaria os botões sem explicação.
    ...Object.values(rascunho.fatores).map((campo) =>
      campo.tipo === 'fixo' ? campo.fixoReais : campo.percentual,
    ),
  ].every((texto) => Number.isFinite(paraNumero(texto)))
}

/** Os campos na forma que as Server Actions esperam: reais e porcentagem. */
function entradaDosCampos(rascunho: RascunhoDoProfissional) {
  return {
    precosBase: Object.entries(rascunho.precosBase).map(([chave, texto]) => ({
      chave,
      valorReais: paraNumero(texto),
    })),
    faixas: Object.entries(rascunho.faixas).map(([chave, texto]) => ({
      chave,
      valorReais: paraNumero(texto),
    })),
    // O percentual vai sempre, inclusive de quem cobra em reais: é o valor
    // guardado, e é ele que volta a valer se o seletor voltar para %.
    fatores: Object.entries(rascunho.fatores).map(([chave, campo]) => ({
      chave,
      acrescimoPercentual: paraNumero(campo.percentual),
      acrescimoFixoReais:
        campo.tipo === 'fixo' ? paraNumero(campo.fixoReais) : null,
    })),
  }
}
