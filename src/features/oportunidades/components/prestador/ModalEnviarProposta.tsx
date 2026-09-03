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
import { enviarProposta } from '../../actions/propostas'
import {
  LIMITE_MENSAGEM_PROPOSTA,
  ehDeSimulacao,
  rotuloDaCategoria,
} from '../../constants/oportunidade'
import { VALIDADES_PROPOSTA, VALIDADE_PADRAO_HORAS } from '../../lib/vigencia'
import type { OportunidadeParaPrestadorDTO } from '../../types/oportunidade'
import { ListaDeAnexos } from '../compartilhado/ListaDeAnexos'
import { RetratoDaSimulacao } from '../compartilhado/RetratoDaSimulacao'
import { formatarDataHora, formatarValor } from '../compartilhado/formato'

/** Centavos como o campo de texto os mostra. Nulo vira campo vazio. */
function centavosNoCampo(centavos: number | null) {
  return centavos == null
    ? ''
    : (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

/**
 * Envio da proposta do prestador.
 *
 * O que o prestador escreve aqui é a **mensagem da proposta**: como ele
 * pretende atender àquela necessidade. Não é a apresentação dele — quem ele é
 * já está no perfil público, que viaja junto e o Cliente abre em "Ver perfil".
 * Repetir currículo no lugar de responder ao pedido é exatamente o que o rótulo
 * antigo ("Sua apresentação") induzia.
 *
 * Reabrir com uma proposta já enviada preenche os campos: reenviar é revisar,
 * nunca criar uma segunda.
 */
export function ModalEnviarProposta({
  oportunidade,
  aberto,
  onFechar,
  onEnviada,
}: {
  oportunidade: OportunidadeParaPrestadorDTO
  aberto: boolean
  onFechar: () => void
  onEnviada: () => void
}) {
  const jaEnviada = oportunidade.minhaProposta
  const daSimulacao = ehDeSimulacao(oportunidade.origem)
  const [mensagem, setMensagem] = useState(jaEnviada?.mensagem ?? '')
  /*
    Numa solicitação vinda da simulação, o campo abre com o valor que o cliente
    **viu** — que é o preço do próprio profissional, calculado pela tabela dele.
    Não é preenchimento automático de proposta: é a sugestão óbvia, editável, e
    ela some no instante em que ele digita outra coisa. Deixar em branco faria o
    profissional redigitar o preço que a plataforma acabou de mostrar por ele.
  */
  const [valor, setValor] = useState(
    centavosNoCampo(
      jaEnviada?.valorCentavos ??
        (daSimulacao ? oportunidade.simulacao?.precoMensalCentavos : null) ??
        null,
    ),
  )
  const [prazo, setPrazo] = useState(
    jaEnviada?.prazoEstimadoDias ? String(jaEnviada.prazoEstimadoDias) : '',
  )
  const [validadeHoras, setValidadeHoras] = useState<number>(
    VALIDADE_PADRAO_HORAS,
  )
  const [enviando, iniciarTransicao] = useTransition()

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciarTransicao(async () => {
      const resultado = await enviarProposta({
        oportunidadeId: oportunidade.id,
        mensagem,
        valor,
        prazoEstimadoDias: prazo ? Number(prazo) : undefined,
        validadeHoras,
      })

      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success(resultado.mensagem)
      onEnviada()
      onFechar()
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {jaEnviada
              ? 'Revisar proposta'
              : daSimulacao
                ? 'Responder ao interesse'
                : 'Enviar proposta'}
          </DialogTitle>
          <DialogDescription>
            {rotuloDaCategoria(oportunidade.categoria)} ·{' '}
            {oportunidade.abrangencia}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {daSimulacao ? 'O que o cliente simulou' : 'Necessidade do cliente'}
          </p>
          {oportunidade.simulacao ? (
            <RetratoDaSimulacao
              simulacao={oportunidade.simulacao}
              titulo="Cenário simulado"
            />
          ) : (
            <p className="mt-2 whitespace-pre-line text-sm">
              {oportunidade.descricao}
            </p>
          )}
          {oportunidade.especialidades.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {oportunidade.especialidades.map((item) => (
                <span
                  key={item}
                  className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {oportunidade.simulacao ? null : (
            <p className="mt-3 text-xs text-muted-foreground">
              Quanto o Cliente pretende investir:{' '}
              <b className="text-foreground">
                {formatarValor(oportunidade.valorPretendidoCentavos)}
              </b>
            </p>
          )}
          <ListaDeAnexos anexos={oportunidade.anexos} />
        </div>

        <form className="space-y-5" onSubmit={salvar}>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="proposta-mensagem" className="text-xs">
                Mensagem da proposta
              </Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {mensagem.length} / {LIMITE_MENSAGEM_PROPOSTA}
              </span>
            </div>
            <Textarea
              id="proposta-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              maxLength={LIMITE_MENSAGEM_PROPOSTA}
              placeholder={
                daSimulacao
                  ? 'Diga que tem interesse e o que você precisa saber para seguir.'
                  : 'Explique como pretende atender a esta necessidade.'
              }
              rows={4}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              {daSimulacao
                ? 'É por aqui que a conversa começa: responder confirma seu interesse e leva sua mensagem ao cliente. Não é contratação.'
                : 'Explique como pretende atender a esta necessidade e o que está incluído. O Cliente compara as propostas por esta mensagem.'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="proposta-valor">Valor (opcional)</Label>
              <Input
                id="proposta-valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="350,00"
              />
              {/* Sem valor a proposta continua válida: "a combinar" é resposta
                  legítima nesta fase, e um número inventado seria pior. */}
              <p className="text-[11px] text-muted-foreground">
                Em branco, aparece como &quot;valor a combinar&quot;.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proposta-prazo">Prazo de execução (dias)</Label>
              <Input
                id="proposta-prazo"
                type="number"
                min={0}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                placeholder="7"
              />
              <p className="text-[11px] text-muted-foreground">
                Em branco, aparece como &quot;prazo a combinar&quot;.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="proposta-validade">Sua proposta vale por</Label>
            {/* Validade comercial — quanto tempo você sustenta este preço. Não
                se confunde com o prazo de execução acima. */}
            <select
              id="proposta-validade"
              value={validadeHoras}
              onChange={(e) => setValidadeHoras(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {VALIDADES_PROPOSTA.map((opcao) => (
                <option key={opcao.horas} value={opcao.horas}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
            {oportunidade.expiraEm && (
              <p className="text-[11px] text-muted-foreground">
                A oportunidade encerra em {formatarDataHora(oportunidade.expiraEm)}
                . Validades maiores são ajustadas para esse limite.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando
                ? 'Enviando...'
                : jaEnviada
                  ? 'Salvar proposta'
                  : daSimulacao
                    ? 'Tenho interesse'
                    : 'Enviar proposta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
