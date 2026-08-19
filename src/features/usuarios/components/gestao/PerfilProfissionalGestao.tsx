'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { analisarPerfilProfissional } from '../../actions/analisar-perfil-profissional'
import { ResumoPerfilProfissional } from '../profissional/ResumoPerfilProfissional'
import type { obterPerfilProfissionalGestao } from '../../queries/obter-perfil-profissional-gestao'
type Dados = NonNullable<Awaited<ReturnType<typeof obterPerfilProfissionalGestao>>>
type Decisao = 'aprovado' | 'correcao_solicitada' | 'rejeitado'
const STATUS: Record<string, string> = { rascunho: 'Rascunho', aguardando_analise: 'Aguardando análise', correcao_solicitada: 'Correção solicitada', rejeitado: 'Rejeitado', aprovado: 'Aprovado' }
export function PerfilProfissionalGestao({ dados }: { dados: Dados }) {
  const router = useRouter(); const [decisao, setDecisao] = useState<Decisao | null>(null); const [mensagem, setMensagem] = useState(''); const [retorno, setRetorno] = useState(''); const [pendente, iniciarTransicao] = useTransition(); const p = dados.perfil
  function confirmar() { if (!decisao) return; iniciarTransicao(async () => { const resultado = await analisarPerfilProfissional({ usuarioId: dados.usuario.id, decisao, mensagem }); setRetorno(resultado.mensagem); if (resultado.sucesso) { setDecisao(null); setMensagem(''); router.refresh() } }) }
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6"><Button asChild variant="ghost"><Link href="/gestao/usuarios"><ArrowLeft/>Voltar</Link></Button>
    <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-serif text-3xl font-bold">Perfil profissional</h1><p className="mt-2 text-muted-foreground">Dados enviados para análise por {dados.usuario.nome}.</p></div>{p && <div className="text-sm sm:text-right"><p className="font-semibold">{STATUS[p.statusAnalise] ?? p.statusAnalise}</p><p className="text-muted-foreground">Enviado em {p.enviadoEm ? new Intl.DateTimeFormat('pt-BR').format(new Date(p.enviadoEm)) : 'não enviado'}</p>{p.analisadoEm && <p className="text-muted-foreground">Analisado em {new Intl.DateTimeFormat('pt-BR').format(new Date(p.analisadoEm))}</p>}</div>}</div>
    <div className="mt-6">{!p ? <Card><CardContent className="p-6">Este usuário ainda não possui cadastro profissional.</CardContent></Card> : <ResumoPerfilProfissional dados={{ ...p, ...dados.usuario }}/>}</div>{retorno && <p className="mt-5 rounded-lg border p-3 text-sm">{retorno}</p>}
    {p?.statusAnalise === 'aguardando_analise' && <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setDecisao('correcao_solicitada')}><RotateCcw/>Solicitar correção</Button><Button variant="destructive" onClick={() => setDecisao('rejeitado')}><XCircle/>Rejeitar</Button><Button onClick={() => setDecisao('aprovado')}><CheckCircle2/>Aprovar</Button></div>}
    <Dialog open={Boolean(decisao)} onOpenChange={(aberto) => !aberto && setDecisao(null)}><DialogContent><DialogHeader><DialogTitle>{decisao === 'aprovado' ? 'Aprovar cadastro?' : decisao === 'rejeitado' ? 'Rejeitar cadastro?' : 'Solicitar correção?'}</DialogTitle><DialogDescription>{decisao === 'aprovado' ? 'O profissional terá acesso ao painel administrativo.' : 'A mensagem será exibida ao profissional após o próximo acesso.'}</DialogDescription></DialogHeader>{decisao !== 'aprovado' && <div><Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Explique objetivamente o motivo e a orientação necessária." className="min-h-28"/><p className="mt-1 text-xs text-muted-foreground">Mínimo de 10 caracteres.</p></div>}<DialogFooter><Button variant="outline" disabled={pendente} onClick={() => setDecisao(null)}>Cancelar</Button><Button disabled={pendente || (decisao !== 'aprovado' && mensagem.trim().length < 10)} onClick={confirmar}>{pendente ? 'Salvando...' : 'Confirmar decisão'}</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
