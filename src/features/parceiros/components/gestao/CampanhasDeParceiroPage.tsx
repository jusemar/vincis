'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Flag, RefreshCw, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pilula, type Tom } from '@/features/portal-cliente/components/ui/primitivos'
import {
  cancelarCampanhaDeParceiros,
  publicarCampanhaDeParceiros,
  recalcularProgressoDaCampanha,
  salvarRascunhoDeCampanha,
} from '../../actions/campanhas'
import {
  AJUDA_TIPO_META,
  ROTULO_SITUACAO_CAMPANHA,
  ROTULO_TIPO_META,
  TIPOS_META,
  TIPOS_META_FUTUROS,
  descreverRecompensa,
  formatarProgresso,
  metaEmDinheiro,
  type SituacaoCampanha,
  type TipoMeta,
} from '../../constants/campanha'
import type { CampanhaParaGestao } from '../../lib/campanhas'

/**
 * Campanhas do Programa de Parceiros, na Gestão Vincis.
 *
 * Criar → revisar → publicar. Rascunho se edita; publicada fica congelada e só
 * pode ser cancelada enquanto ninguém ganhou a recompensa. Meta progressiva e
 * meta combinada aparecem, desativadas, como "Em breve" — o servidor recusa
 * salvá-las mesmo que a requisição seja forjada.
 */

const TOM: Record<SituacaoCampanha, Tom> = {
  rascunho: 'neutro',
  agendada: 'info',
  ativa: 'sucesso',
  encerrada: 'neutro',
  cancelada: 'atencao',
}

type Formulario = {
  id?: string
  titulo: string
  descricao: string
  tipoMeta: TipoMeta
  alvo: string
  bonus: string
  pontos: string
  inicio: string
  fim: string
}

const VAZIO: Formulario = {
  titulo: '',
  descricao: '',
  tipoMeta: 'novos_clientes_recorrentes',
  alvo: '',
  bonus: '',
  pontos: '',
  inicio: '',
  fim: '',
}

function data(dataLocal: string) {
  const [ano, mes, dia] = dataLocal.split('-')
  return `${dia}/${mes}/${ano}`
}

function centavosParaCampo(centavos: number) {
  return centavos ? `${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, '0')}` : ''
}

export function CampanhasDeParceiroPage({ campanhas }: { campanhas: CampanhaParaGestao[] }) {
  const router = useRouter()
  const [formulario, setFormulario] = useState<Formulario>(VAZIO)
  const [salvando, iniciarSalvamento] = useTransition()
  const [agindo, iniciarAcao] = useTransition()
  const [confirmando, setConfirmando] = useState<string | null>(null)

  const alterar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setFormulario((atual) => ({ ...atual, [campo]: valor }))

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarSalvamento(async () => {
      const resultado = await salvarRascunhoDeCampanha(formulario)
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      setFormulario(VAZIO)
      router.refresh()
    })
  }

  function executar(
    chave: string,
    acao: () => Promise<{ sucesso: boolean; mensagem: string }>,
  ) {
    iniciarAcao(async () => {
      const resultado = await acao()
      setConfirmando(null)
      if (!resultado.sucesso) toast.error(resultado.mensagem)
      else {
        toast.success(resultado.mensagem)
        router.refresh()
      }
      void chave
    })
  }

  function editar(campanha: CampanhaParaGestao) {
    setFormulario({
      id: campanha.id,
      titulo: campanha.titulo,
      descricao: campanha.descricao,
      tipoMeta: campanha.tipoMeta,
      alvo: metaEmDinheiro(campanha.tipoMeta) ? centavosParaCampo(campanha.alvo) : String(campanha.alvo),
      bonus: centavosParaCampo(campanha.bonusCentavos),
      pontos: campanha.pontos ? String(campanha.pontos) : '',
      inicio: campanha.inicio,
      fim: campanha.fim,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const emDinheiro = metaEmDinheiro(formulario.tipoMeta)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header>
        <Link
          href="/admin/parceiros"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> Parceiros
        </Link>
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Programa de Parceiros
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold">Campanhas</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Metas por tempo limitado, com bônus em dinheiro, pontos ou os dois. Não mudam o
          percentual de comissão nem o nível. Valem para todos os parceiros ativos.
        </p>
      </header>

      <Card className="border-border/70 bg-card/90 backdrop-blur">
        <CardContent className="p-6">
          <h2 className="font-semibold">
            {formulario.id ? 'Editar rascunho' : 'Nova campanha'}
          </h2>
          <form className="mt-4 space-y-5" onSubmit={salvar}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="campanha-titulo" className="text-xs">Título</Label>
                <Input id="campanha-titulo" value={formulario.titulo} maxLength={120}
                  onChange={(e) => alterar('titulo', e.target.value)} placeholder="Meta de Outubro" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="campanha-descricao" className="text-xs">Descrição curta</Label>
                <Input id="campanha-descricao" value={formulario.descricao} maxLength={280}
                  onChange={(e) => alterar('descricao', e.target.value)} />
              </div>
            </div>

            <fieldset>
              <legend className="text-xs font-medium">Tipo da meta</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {TIPOS_META.map((tipo) => (
                  <label
                    key={tipo}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      formulario.tipoMeta === tipo ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40'
                    }`}
                  >
                    <input type="radio" name="tipo-meta" value={tipo} className="mt-1"
                      checked={formulario.tipoMeta === tipo}
                      onChange={() => alterar('tipoMeta', tipo)} />
                    <span>
                      <span className="block font-medium">{ROTULO_TIPO_META[tipo]}</span>
                      <span className="block text-xs text-muted-foreground">{AJUDA_TIPO_META[tipo]}</span>
                    </span>
                  </label>
                ))}
                {TIPOS_META_FUTUROS.map((futuro) => (
                  <label
                    key={futuro.codigo}
                    aria-disabled="true"
                    className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-3 text-sm opacity-70"
                  >
                    <input type="radio" name="tipo-meta" value={futuro.codigo} disabled className="mt-1" />
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{futuro.rotulo}</span>
                      <Pilula rotulo="Em breve" tom="neutro" />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="campanha-alvo" className="text-xs">
                  {emDinheiro ? 'Valor-alvo (R$)' : formulario.tipoMeta === 'servicos_avulsos' ? 'Serviços necessários' : 'Clientes necessários'}
                </Label>
                <Input id="campanha-alvo" inputMode={emDinheiro ? 'decimal' : 'numeric'} value={formulario.alvo}
                  onChange={(e) => alterar('alvo', e.target.value)} placeholder={emDinheiro ? '3.000,00' : '3'} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campanha-bonus" className="text-xs">Bônus em dinheiro (R$)</Label>
                <Input id="campanha-bonus" inputMode="decimal" value={formulario.bonus}
                  onChange={(e) => alterar('bonus', e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campanha-pontos" className="text-xs">Pontos</Label>
                <Input id="campanha-pontos" inputMode="numeric" value={formulario.pontos}
                  onChange={(e) => alterar('pontos', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campanha-inicio" className="text-xs">Início</Label>
                <Input id="campanha-inicio" type="date" value={formulario.inicio}
                  onChange={(e) => alterar('inicio', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campanha-fim" className="text-xs">Fim</Label>
                <Input id="campanha-fim" type="date" value={formulario.fim}
                  onChange={(e) => alterar('fim', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Datas no horário de Brasília, inclusive o dia final. Defina ao menos uma recompensa.
              Depois de publicada, a regra fica congelada.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Salvando…' : formulario.id ? 'Salvar rascunho' : 'Criar rascunho'}
              </Button>
              {formulario.id ? (
                <Button type="button" variant="outline" onClick={() => setFormulario(VAZIO)}>
                  Descartar edição
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Campanhas criadas
        </h2>
        {campanhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
        ) : null}
        {campanhas.map((campanha) => {
          const chavePublicar = `publicar:${campanha.id}`
          const chaveCancelar = `cancelar:${campanha.id}`
          const atingiram = campanha.participantes.filter((p) => p.atingiu).length
          return (
            <Card key={campanha.id} className="border-border/70 bg-card/90 backdrop-blur">
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <Flag className="size-4 text-primary" aria-hidden />
                      {campanha.titulo}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data(campanha.inicio)} a {data(campanha.fim)} · {ROTULO_TIPO_META[campanha.tipoMeta]} ·
                      alvo {formatarProgresso(campanha.tipoMeta, 0, campanha.alvo).split(' / ')[1]} ·
                      {' '}{descreverRecompensa(campanha.bonusCentavos, campanha.pontos)}
                    </p>
                  </div>
                  <Pilula rotulo={ROTULO_SITUACAO_CAMPANHA[campanha.situacao]} tom={TOM[campanha.situacao]} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {campanha.status === 'rascunho' ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => editar(campanha)}>Editar</Button>
                      {confirmando === chavePublicar ? (
                        <Button size="sm" disabled={agindo}
                          onClick={() => executar(chavePublicar, () => publicarCampanhaDeParceiros({ id: campanha.id }))}>
                          Confirmar publicação
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setConfirmando(chavePublicar)}>Publicar</Button>
                      )}
                    </>
                  ) : null}
                  {campanha.status === 'publicada' ? (
                    <Button size="sm" variant="outline" disabled={agindo}
                      onClick={() => executar(`recalcular:${campanha.id}`, () => recalcularProgressoDaCampanha({ id: campanha.id }))}>
                      <RefreshCw className="size-3.5" aria-hidden /> Recalcular progresso
                    </Button>
                  ) : null}
                  {campanha.status !== 'cancelada' ? (
                    confirmando === chaveCancelar ? (
                      <Button size="sm" variant="destructive" disabled={agindo}
                        onClick={() => executar(chaveCancelar, () => cancelarCampanhaDeParceiros({ id: campanha.id }))}>
                        Confirmar cancelamento
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmando(chaveCancelar)}>Cancelar campanha</Button>
                    )
                  ) : null}
                </div>

                {campanha.status !== 'rascunho' ? (
                  <div className="border-t pt-4">
                    <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <Users className="size-3.5" aria-hidden />
                      {campanha.participantes.length} participante(s) · {atingiram} atingiram a meta
                    </p>
                    {campanha.participantes.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {campanha.participantes.map((participante) => (
                          <li key={participante.parceiroId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate">
                              {participante.nome}
                              {participante.codigo ? (
                                <span className="font-mono text-xs text-muted-foreground"> · {participante.codigo}</span>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-2 tabular-nums">
                              {formatarProgresso(campanha.tipoMeta, participante.progresso, campanha.alvo)}
                              {participante.atingiu ? <Pilula rotulo="Atingiu" tom="sucesso" /> : null}
                              {participante.recompensaStatus === 'revertida' && !participante.atingiu ? (
                                <Pilula rotulo="Revertida" tom="atencao" />
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </section>
    </div>
  )
}
