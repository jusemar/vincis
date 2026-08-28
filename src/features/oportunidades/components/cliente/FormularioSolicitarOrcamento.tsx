'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { criarOportunidade } from '../../actions/oportunidades'
import { ABRANGENCIAS, ABRANGENCIA_PADRAO } from '../../constants/abrangencia'
import {
  CATEGORIAS_OPORTUNIDADE,
  CATEGORIA_OPORTUNIDADE,
  LIMITE_ANEXOS_OPORTUNIDADE,
  LIMITE_DESCRICAO_OPORTUNIDADE,
  type CategoriaOportunidade,
} from '../../constants/oportunidade'

/**
 * Tempo do aviso de "entre para enviar".
 *
 * Mais longo que o padrão do Sonner de propósito: é uma orientação com dois
 * passos (entrar **e** confirmar a conta), não um "salvo com sucesso". O limite
 * global de toasts empilhados continua o do projeto.
 */
const DURACAO_AVISO_LOGIN = 8000

/** Mesma altura dos `Input` do design system — o `select` nativo não a herda. */
const CLASSE_SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

const CLASSE_AJUDA = 'text-[11px] leading-snug text-muted-foreground'

/**
 * O Profissional escolhido, quando o pedido nasce no perfil dele.
 *
 * `categorias` são as áreas públicas que **aquele** cadastro realmente alcança
 * — nunca a lista inteira da plataforma. É o que impede o Cliente de pedir a um
 * advogado um trabalho contábil por engano, e o servidor confere a mesma coisa
 * contra o cadastro real antes de gravar.
 */
export type DestinatarioDaSolicitacao = {
  id: string
  nome: string
  categorias: CategoriaOportunidade[]
}

/**
 * Formulário de solicitação de orçamento — o mesmo nas duas portas de entrada.
 *
 * Sem `destinatario`, é o formulário público de `/profissionais`: a pessoa está
 * comparando profissionais quando percebe que não sabe qual escolher, e o
 * pedido vai para a categoria inteira. Com `destinatario`, é o mesmo formulário
 * aberto no perfil de alguém — mesmos campos, mesmas validações, mesmos anexos
 * —, e a única diferença é que o pedido vai só para aquela pessoa e a categoria
 * fica restrita ao que ela pode prestar.
 *
 * Um componente só, e não dois, porque duplicá-lo significaria manter duas
 * versões da mesma validação, do mesmo limite de descrição e do mesmo
 * tratamento de sessão.
 *
 * Não vive em modal: a pessoa está lendo a página quando decide pedir, e tirá-la
 * dali para um diálogo é justamente perder esse contexto. Pelo mesmo motivo o
 * formulário é **compacto** — ele divide a tela com o que estava sendo lido.
 *
 * O envio é um `FormData` por causa dos anexos — mesmo caminho que o anexo de
 * Atendimento já usa. Nada é enviado sem sessão: a recusa vem do servidor, o
 * texto digitado permanece na tela e a pessoa é levada ao login.
 */
export function FormularioSolicitarOrcamento({
  onCancelar,
  onEnviada,
  destinatario,
}: {
  onCancelar: () => void
  onEnviada?: () => void
  /** Presente = solicitação privada, dirigida a este Profissional. */
  destinatario?: DestinatarioDaSolicitacao
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  /**
   * As categorias oferecidas.
   *
   * No privado, exatamente as do destinatário; no público, todas. A primeira
   * já vem escolhida — no caso mais comum (um Profissional de uma área só) isso
   * significa que não há nada para escolher, e o campo vira leitura.
   */
  const categoriasOferecidas = destinatario?.categorias ?? CATEGORIAS_OPORTUNIDADE
  const [categoria, setCategoria] = useState<CategoriaOportunidade>(
    categoriasOferecidas[0] ?? 'contabilidade',
  )
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [descricao, setDescricao] = useState('')
  const [anexos, setAnexos] = useState<File[]>([])
  const [enviando, iniciarTransicao] = useTransition()

  function alternarEspecialidade(item: string) {
    setEspecialidades((atual) =>
      atual.includes(item)
        ? atual.filter((escolhida) => escolhida !== item)
        : [...atual, item],
    )
  }

  /** Trocar de categoria zera as especialidades: elas pertencem à categoria. */
  function trocarCategoria(nova: CategoriaOportunidade) {
    setCategoria(nova)
    setEspecialidades([])
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const dados = new FormData(evento.currentTarget)
    // As especialidades são estado do componente (chips), não campos do HTML.
    dados.delete('especialidades')
    for (const item of especialidades) dados.append('especialidades', item)
    // A categoria também é estado quando o campo é leitura (destinatário de uma
    // área só): sem isto o `select` inexistente não mandaria nada.
    dados.set('categoria', categoria)

    iniciarTransicao(async () => {
      const resultado = await criarOportunidade(dados)

      if (!resultado.sucesso) {
        if (resultado.precisaEntrar) {
          toast.info(resultado.mensagem, { duration: DURACAO_AVISO_LOGIN })
          router.push('/profissionais?entrar=1')
          return
        }
        toast.error(resultado.mensagem, {
          duration: resultado.contaNaoConfirmada
            ? DURACAO_AVISO_LOGIN
            : undefined,
        })
        return
      }

      toast.success(resultado.mensagem)
      formRef.current?.reset()
      setEspecialidades([])
      setDescricao('')
      setAnexos([])
      onEnviada?.()
      onCancelar()
      router.refresh()
    })
  }

  return (
    <form
      ref={formRef}
      className="mt-5 space-y-4 border-t pt-5"
      onSubmit={enviar}
    >
      {/* O destinatário viaja no próprio formulário. Quem ele é, se pode
          operar e se atende a categoria são perguntas do servidor — este campo
          só diz para quem o Cliente quis pedir. */}
      {destinatario ? (
        <input type="hidden" name="destinatarioId" value={destinatario.id} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div className="space-y-1.5">
          <Label htmlFor="oportunidade-categoria" className="text-xs">
            Categoria
          </Label>
          {/* Uma categoria só não é uma escolha: mostrar um `select` de uma
              opção pediria uma decisão que não existe. O valor continua sendo
              enviado — vem do estado, não do campo. */}
          {categoriasOferecidas.length === 1 ? (
            <p
              id="oportunidade-categoria"
              className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm"
            >
              {CATEGORIA_OPORTUNIDADE[categoria].rotulo}
            </p>
          ) : (
            <select
              id="oportunidade-categoria"
              name="categoria"
              value={categoria}
              onChange={(e) =>
                trocarCategoria(e.target.value as CategoriaOportunidade)
              }
              className={CLASSE_SELECT}
            >
              {categoriasOferecidas.map((item) => (
                <option key={item} value={item}>
                  {CATEGORIA_OPORTUNIDADE[item].rotulo}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oportunidade-abrangencia" className="text-xs">
            Abrangência
          </Label>
          {/* `BR` significa o país inteiro. É o código, e é assim que ele
              aparece — sem legenda ao lado. */}
          <select
            id="oportunidade-abrangencia"
            name="abrangencia"
            defaultValue={ABRANGENCIA_PADRAO}
            className={CLASSE_SELECT}
          >
            {ABRANGENCIAS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Especialidades (opcional)</Label>
        {/* Visíveis, não escondidas em dropdown: são o que ajuda o Cliente a
            reconhecer o próprio caso, e ele precisa vê-las para reconhecer. */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIA_OPORTUNIDADE[categoria].especialidades.map((item) => {
            const escolhida = especialidades.includes(item)
            return (
              <button
                key={item}
                type="button"
                aria-pressed={escolhida}
                onClick={() => alternarEspecialidade(item)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  escolhida
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {item}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="oportunidade-descricao" className="text-xs">
            Descreva o que você precisa
          </Label>
          {/* Discreto de propósito: o contador serve de referência, não de
              elemento principal do formulário. */}
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {descricao.length} / {LIMITE_DESCRICAO_OPORTUNIDADE}
          </span>
        </div>
        <Textarea
          id="oportunidade-descricao"
          name="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          // O `maxLength` evita a digitação além do teto; o Zod e o servidor
          // recusam o que vier por outro caminho. Nada é truncado em silêncio.
          maxLength={LIMITE_DESCRICAO_OPORTUNIDADE}
          placeholder="Ex.: Preciso abrir uma empresa de prestação de serviços e organizar os impostos do primeiro ano."
          rows={4}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="oportunidade-valor" className="text-xs">
            Quanto pretende investir? (opcional)
          </Label>
          <Input
            id="oportunidade-valor"
            name="valorPretendido"
            inputMode="decimal"
            placeholder="1.500,00"
          />
          <p className={CLASSE_AJUDA}>
            Só uma referência. Os profissionais podem propor outros valores.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oportunidade-anexos" className="text-xs">
            Anexos (opcional)
          </Label>
          <Label
            htmlFor="oportunidade-anexos"
            className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-xs font-normal text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">
              {anexos.length
                ? anexos.map((arquivo) => arquivo.name).join(', ')
                : 'Escolher arquivos ou imagens'}
            </span>
          </Label>
          <Input
            id="oportunidade-anexos"
            name="anexos"
            type="file"
            multiple
            accept=".txt,.pdf,.jpg,.jpeg,.png,text/plain,application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => setAnexos(Array.from(e.target.files ?? []))}
          />
          <p className={CLASSE_AJUDA}>
            Até {LIMITE_ANEXOS_OPORTUNIDADE} arquivos de 10 MB — TXT, PDF, JPG
            ou PNG.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className={`${CLASSE_AJUDA} max-w-md`}>
          {destinatario ? (
            <>
              Sua solicitação será enviada somente para{' '}
              <b className="font-semibold text-foreground">
                {destinatario.nome}
              </b>
              . Nenhum outro profissional vai vê-la, e a resposta fica no seu
              painel Vincis.
            </>
          ) : (
            <>
              Sua solicitação será exibida aos profissionais compatíveis. As
              propostas recebidas ficarão disponíveis somente no seu painel
              Vincis.
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
            <X className="size-4" />
            Fechar
          </Button>
          <Button type="submit" size="sm" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar solicitação'}
          </Button>
        </div>
      </div>
    </form>
  )
}
