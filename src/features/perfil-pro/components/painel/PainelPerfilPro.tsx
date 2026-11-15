'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { BadgeCheck, FileText, HardDrive, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { PagamentoPixDoPlano } from '@/features/assinaturas/components/cliente/PagamentoPixDoPlano'
import { cn } from '@/lib/utils'
import { contratarArmazenamentoExtra, contratarPerfilPro, obterMeuPerfilPro } from '../../actions/perfil-pro'
import {
  DISPONIVEL_NO_PRO,
  PERFIL_ATUAL,
  PERIODOS_PERFIL_PRO,
  ROTULO_ARMAZENAMENTO_EXTRA,
  type CodigoPeriodoPerfilPro,
} from '../../constants/perfil-pro'

type Dados = NonNullable<Awaited<ReturnType<typeof obterMeuPerfilPro>>['dados']>

function reais(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function tamanho(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

function data(iso: string) {
  return iso.split('-').reverse().join('/')
}

/**
 * Perfil Essencial / Perfil Pro, no painel do advogado.
 *
 * - Mostra em qual perfil a conta está e o que cada um libera;
 * - contrata o Pro (mensal, 6 ou 12 meses) com o Pix que a Vincis já usa —
 *   pagamento do advogado à Vincis, não honorário de cliente;
 * - mostra o armazenamento usado e, quando houver limite configurado, a barra.
 *
 * Nada é pré-selecionado e nenhuma cobrança nasce ao abrir a aba ou ao
 * escolher o período: o Pix só é gerado depois do clique em "Contratar".
 *
 * Todo botão aqui é `type="button"`: a aba vive dentro do formulário do perfil
 * e não pode submetê-lo.
 */
export function PainelPerfilPro() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [periodo, setPeriodo] = useState<CodigoPeriodoPerfilPro | null>(null)
  /** Assinatura cujo Pix está na tela — só existe depois do clique. */
  const [assinaturaId, setAssinaturaId] = useState<string | null>(null)
  const [escolhendoEspaco, setEscolhendoEspaco] = useState(false)
  const [espacoId, setEspacoId] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()

  const aplicar = useCallback((resposta: Awaited<ReturnType<typeof obterMeuPerfilPro>>) => {
    if (resposta.dados) setDados(resposta.dados)
  }, [])

  const carregar = useCallback(() => obterMeuPerfilPro().then(aplicar), [aplicar])

  useEffect(() => {
    obterMeuPerfilPro().then(aplicar)
  }, [aplicar])

  function contratar() {
    if (!periodo) return
    iniciar(async () => {
      const resposta = await contratarPerfilPro({ periodo })
      if (!resposta.sucesso) {
        toast.error(resposta.mensagem)
        return
      }
      setAssinaturaId(resposta.dados.assinaturaId)
    })
  }

  /** Trocar o período descarta o Pix da tela; um novo clique gera o certo. */
  function escolher(codigo: CodigoPeriodoPerfilPro) {
    setPeriodo(codigo)
    setAssinaturaId(null)
  }

  function contratarEspaco() {
    iniciar(async () => {
      const resposta = await contratarArmazenamentoExtra()
      if (!resposta.sucesso) {
        toast.error(resposta.mensagem)
        return
      }
      setEspacoId(resposta.dados.assinaturaId)
    })
  }

  function espacoPago() {
    setEspacoId(null)
    setEscolhendoEspaco(false)
    void carregar()
  }

  if (!dados) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
  }

  const pro = dados.nivel === 'pro'
  const { armazenamento } = dados

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <BadgeCheck className={cn('size-5', pro ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            {PERFIL_ATUAL[pro ? 'pro' : 'essencial']}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {pro ? (
            <p className="text-muted-foreground">
              Ativo até <strong className="text-foreground">{dados.proAte ? data(dados.proAte) : '—'}</strong>. Envio e
              recebimento de documentos pela Vincis liberados. Quando vencer, a conta volta ao Perfil Essencial — nenhum
              documento é apagado.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                No Perfil Essencial você aparece na busca, recebe pedidos de orçamento e conversa por texto. Documentos
                são enviados pelos clientes ao seu e-mail profissional de contato.
              </p>
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="size-3.5 shrink-0" aria-hidden />
                  Enviar e receber documentos pela Vincis
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{DISPONIVEL_NO_PRO}</span>
                </li>
              </ul>

              <div className="space-y-2" role="radiogroup" aria-label="Período do Perfil Pro">
                <p className="text-xs font-semibold text-foreground">Contratar Perfil Pro</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PERIODOS_PERFIL_PRO.map((p) => (
                    <button
                      key={p.codigo}
                      type="button"
                      role="radio"
                      aria-checked={periodo === p.codigo}
                      onClick={() => escolher(p.codigo)}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-colors',
                        periodo === p.codigo ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                      )}
                    >
                      <span className="block text-xs text-muted-foreground">{p.rotulo}</span>
                      <span className="block text-lg font-bold text-foreground">{reais(p.totalCentavos)}</span>
                      {p.meses > 1 ? (
                        <span className="block text-[11px] text-muted-foreground">{reais(p.mensalCentavos)}/mês</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Pagamento à Vincis pelo uso da plataforma. Não tem relação com honorários de clientes, não altera sua
                  posição na busca e não renova sozinho.
                </p>
              </div>

              {assinaturaId ? (
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Contratação iniciada. Conclua o pagamento por Pix para ativar o Perfil Pro.
                  </p>
                  <PagamentoPixDoPlano
                    assinaturaId={assinaturaId}
                    iniciarAutomaticamente
                    onPago={() => void carregar()}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Button type="button" onClick={contratar} disabled={enviando || !periodo}>
                    {enviando ? 'Iniciando…' : 'Contratar Perfil Pro'}
                  </Button>
                  {!periodo ? <p className="text-[11px] text-muted-foreground">Escolha um período para continuar.</p> : null}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-5 text-muted-foreground" aria-hidden />
            Armazenamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {armazenamento.limiteBytes ? (
            <>
              <p>
                <strong>{tamanho(armazenamento.usadoBytes)}</strong> de{' '}
                <strong>{tamanho(armazenamento.limiteBytes)}</strong> utilizados
              </p>
              <Progress
                value={armazenamento.percentual ?? 0}
                aria-label="Armazenamento utilizado"
                className={cn(armazenamento.esgotado && '[&>div]:bg-destructive')}
              />
            </>
          ) : (
            <p>
              <strong>{tamanho(armazenamento.usadoBytes)}</strong> utilizados.{' '}
              <span className="text-muted-foreground">Limite não configurado.</span>
            </p>
          )}
          {armazenamento.adicionais > 0 ? (
            <p className="text-xs text-muted-foreground">
              Inclui {armazenamento.adicionais} adicional{armazenamento.adicionais > 1 ? 'is' : ''} de +5 GB vigente
              {armazenamento.adicionais > 1 ? 's' : ''}.
            </p>
          ) : null}
          {armazenamento.esgotado ? (
            <p role="alert" className="font-medium text-destructive">
              Seu espaço acabou. Novos documentos não podem ser enviados nem recebidos pela Vincis. Seus arquivos atuais
              continuam guardados.
            </p>
          ) : armazenamento.proximoDoLimite ? (
            <p role="status" className="font-medium text-amber-700 dark:text-amber-300">
              Seu armazenamento está quase no limite.
            </p>
          ) : null}
          {/* Espaço extra: liberado ao atingir o limite, só com Pro ativo. */}
          {armazenamento.esgotado ? (
            pro ? (
              escolhendoEspaco ? (
                <div className="space-y-3 rounded-xl border p-3">
                  <p className="font-semibold text-foreground">{ROTULO_ARMAZENAMENTO_EXTRA}</p>
                  <p className="text-xs text-muted-foreground">
                    Pagamento à Vincis pelo uso da plataforma. Vale por um mês a partir da confirmação, sem renovação
                    automática. Ao vencer, os arquivos não são apagados.
                  </p>
                  {espacoId ? (
                    <PagamentoPixDoPlano assinaturaId={espacoId} iniciarAutomaticamente onPago={espacoPago} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={contratarEspaco} disabled={enviando}>
                        {enviando ? 'Iniciando…' : 'Confirmar e pagar com Pix'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEscolhendoEspaco(false)}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setEscolhendoEspaco(true)}>
                  Aumentar armazenamento
                </Button>
              )
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled>
                  Aumentar armazenamento
                </Button>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {DISPONIVEL_NO_PRO}
                </span>
              </div>
            )
          ) : null}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5" aria-hidden />
            Conta os documentos dos seus atendimentos e dos pedidos de orçamento enviados a você.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
