'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { atualizarServico, criarServico } from '../actions/catalogo'
import type { ModeloPreco } from '../schemas/servico'

/** Serviço já existente, quando o modal está em modo de edição. */
export type ServicoEditavel = {
  id: string
  nome: string
  descricaoCurta: string
  descricaoDetalhada: string
  categoria: string
  itensIncluidos: string[]
  /** Etapas padrão da execução, copiadas para cada Atendimento contratado. */
  checklistModelo: string[]
  modeloPreco: ModeloPreco
  valorCentavos: number | null
  prazoEstimadoDias: number | null
  ativo: boolean
  publico: boolean
  ordem: number
}

type ModalNovoServicoProps = {
  aberto: boolean
  /** Ausente = cadastro novo. */
  servico?: ServicoEditavel | null
  onFechar: () => void
  onSalvo: () => void
}

const MODELOS: { valor: ModeloPreco; rotulo: string; ajuda: string }[] = [
  { valor: 'fixo', rotulo: 'Valor fixo', ajuda: 'Aparece como R$ 350' },
  {
    valor: 'a_partir_de',
    rotulo: 'A partir de',
    ajuda: 'Aparece como A partir de R$ 100',
  },
  { valor: 'por_hora', rotulo: 'Por hora', ajuda: 'Aparece como R$ 180,00/h' },
  {
    valor: 'sob_orcamento',
    rotulo: 'Sob orçamento',
    ajuda: 'Sem valor: o cliente solicita orçamento',
  },
]

const CATEGORIAS = [
  { valor: 'contabil', rotulo: 'Contábil' },
  { valor: 'juridico', rotulo: 'Jurídico' },
  { valor: 'consultoria', rotulo: 'Consultoria' },
] as const

/**
 * Cadastro de um serviço do catálogo.
 *
 * Usa os componentes do design system já existentes (Dialog/Input/Button), sem
 * introduzir estilo novo. É aberto pelo botão `+ Novo Serviço`, cuja aparência
 * e posição permanecem intactas.
 */
export function ModalNovoServico({
  aberto,
  servico,
  onFechar,
  onSalvo,
}: ModalNovoServicoProps) {
  // O estado nasce do serviço recebido. O componente é remontado por `key`
  // quando o alvo muda, então não existe sincronização por efeito — o
  // formulário nunca exibe os dados do item aberto anteriormente.
  const [nome, setNome] = useState(servico?.nome ?? '')
  const [descricaoCurta, setDescricaoCurta] = useState(
    servico?.descricaoCurta ?? '',
  )
  const [descricaoDetalhada, setDescricaoDetalhada] = useState(
    servico?.descricaoDetalhada ?? '',
  )
  const [categoria, setCategoria] = useState<string>(
    servico?.categoria ?? 'contabil',
  )
  const [modeloPreco, setModeloPreco] = useState<ModeloPreco>(
    servico?.modeloPreco ?? 'fixo',
  )
  const [valor, setValor] = useState(
    servico?.valorCentavos == null
      ? ''
      : (servico.valorCentavos / 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
        }),
  )
  const [itens, setItens] = useState(
    (servico?.itensIncluidos ?? []).join('\n'),
  )
  const [checklist, setChecklist] = useState(
    (servico?.checklistModelo ?? []).join('\n'),
  )
  const [prazo, setPrazo] = useState(
    servico?.prazoEstimadoDias ? String(servico.prazoEstimadoDias) : '',
  )
  const [salvando, iniciarTransicao] = useTransition()

  const exigeValor = modeloPreco !== 'sob_orcamento'

  function limpar() {
    setNome('')
    setDescricaoCurta('')
    setDescricaoDetalhada('')
    setCategoria('contabil')
    setModeloPreco('fixo')
    setValor('')
    setItens('')
    setChecklist('')
    setPrazo('')
  }

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const dados = {
        nome,
        descricaoCurta,
        descricaoDetalhada,
        categoria: categoria as (typeof CATEGORIAS)[number]['valor'],
        // Um item por linha vira um chip no perfil público.
        itensIncluidos: itens
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        // Etapas padrão da execução: viram o checklist de cada Atendimento
        // contratado, uma cópia por contratação.
        checklistModelo: checklist
          .split('\n')
          .map((etapa: string) => etapa.trim())
          .filter(Boolean),
        modeloPreco,
        valor: exigeValor ? valor : '',
        prazoEstimadoDias: prazo ? Number(prazo) : undefined,
        // Na edição preservamos os estados já escolhidos pelo prestador.
        ativo: servico?.ativo ?? true,
        publico: servico?.publico ?? true,
        ordem: servico?.ordem ?? 0,
      }
      const resultado = servico
        ? await atualizarServico(servico.id, dados)
        : await criarServico(dados)

      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      limpar()
      onSalvo()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {servico ? 'Editar serviço' : 'Novo serviço'}
          </DialogTitle>
          <DialogDescription>
            Este serviço aparecerá no seu perfil público para contratação.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={salvar}>
          <div className="space-y-2">
            <Label htmlFor="servico-nome">Nome do serviço</Label>
            <Input
              id="servico-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Declaração de IRPF"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="servico-descricao">Descrição curta</Label>
            <Input
              id="servico-descricao"
              value={descricaoCurta}
              onChange={(e) => setDescricaoCurta(e.target.value)}
              placeholder="Para pessoa física com rendimentos simples."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="servico-detalhe">Descrição detalhada</Label>
            <Textarea
              id="servico-detalhe"
              value={descricaoDetalhada}
              onChange={(e) => setDescricaoDetalhada(e.target.value)}
              placeholder="Explique quando este serviço é indicado."
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="servico-categoria">Categoria</Label>
              <select
                id="servico-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {CATEGORIAS.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="servico-prazo">Prazo estimado (dias)</Label>
              <Input
                id="servico-prazo"
                type="number"
                min={0}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                placeholder="7"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="servico-modelo">Modelo de preço</Label>
              <select
                id="servico-modelo"
                value={modeloPreco}
                onChange={(e) => setModeloPreco(e.target.value as ModeloPreco)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {MODELOS.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {MODELOS.find((item) => item.valor === modeloPreco)?.ajuda}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="servico-valor">Valor</Label>
              <Input
                id="servico-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="350,00"
                // Sob orçamento não tem valor: o campo é desabilitado em vez de
                // aceitar um número que não existe.
                disabled={!exigeValor}
                required={exigeValor}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="servico-itens">Itens incluídos</Label>
            <Textarea
              id="servico-itens"
              value={itens}
              onChange={(e) => setItens(e.target.value)}
              placeholder={'Atendimento online\nEntrega da declaração'}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Um item por linha. Aparecem como marcadores no seu perfil.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="servico-checklist">Checklist padrão (opcional)</Label>
            <Textarea
              id="servico-checklist"
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
              placeholder={'Receber documentos\nConferir dados\nRealizar abertura'}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Uma etapa por linha. Cada contratação recebe uma cópia destas
              etapas no atendimento — alterar aqui não muda atendimentos já
              abertos.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando
                ? 'Salvando...'
                : servico
                  ? 'Salvar alterações'
                  : 'Cadastrar serviço'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
