'use client'

import { useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import {
  Bold,
  Columns3,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Rows3,
  Table2,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { enderecoLinkSchema } from '@/features/cms/nucleo/conteudo/schema'
import { cn } from '@/lib/utils'
import { enviarImagemDoNavegador } from './campos/enviar-imagem'
import { IMAGEM_ARTIGO, LIMITES_ARTIGO } from '../../constants/limites'
import { conteudoArtigoSchema, type NoConteudo } from '../../lib/conteudo/schema-conteudo'

/**
 * Editor visual do artigo (TipTap) — carregado sob demanda, sem SSR.
 *
 * Reaproveita o desenho do editor do CMS institucional e liga só o que o schema
 * fechado do artigo aceita: títulos H2/H3, parágrafos, negrito, itálico, links,
 * listas, imagens (enviadas pela Vincis) e tabelas. Código, citação, tachado e
 * afins ficam desligados — colar de outro site não produz formatação que o
 * servidor recusaria. Imagem colada de outro endereço também não passa: o
 * editor avisa e a alteração não sobe para o formulário.
 */
type Propriedades = {
  valor: NoConteudo
  aoAlterar: (valor: NoConteudo) => void
  desabilitado?: boolean
  idRotulo?: string
}

const ESTADO_INICIAL = {
  paragrafo: false,
  titulo2: false,
  titulo3: false,
  negrito: false,
  italico: false,
  link: false,
  marcadores: false,
  numerada: false,
  tabela: false,
  desfazer: false,
  refazer: false,
}

export default function EditorArtigo({ valor, aoAlterar, desabilitado = false, idRotulo }: Propriedades) {
  const [foraDoSchema, setForaDoSchema] = useState<string | null>(null)
  const [linkAberto, setLinkAberto] = useState(false)
  const [enderecoLink, setEnderecoLink] = useState('')
  const [erroLink, setErroLink] = useState<string | null>(null)
  const [imagemAberta, setImagemAberta] = useState(false)
  const [textoAlternativo, setTextoAlternativo] = useState('')
  const [enviandoImagem, setEnviandoImagem] = useState(false)
  const [erroImagem, setErroImagem] = useState<string | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !desabilitado,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
        strike: false,
        underline: false,
        heading: { levels: [2, 3] },
        link: {
          autolink: false,
          linkOnPaste: false,
          openOnClick: false,
          defaultProtocol: 'https',
          protocols: ['mailto', 'tel'],
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: valor,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-80 px-4 py-3 text-base leading-7 text-foreground focus:outline-none',
          '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold',
          '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
          '[&_img]:my-4 [&_img]:max-h-96 [&_img]:rounded-lg [&_img]:border [&_img]:border-border',
          '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left',
          '[&_.selectedCell]:bg-primary/10',
        ),
        role: 'textbox',
        'aria-multiline': 'true',
        ...(idRotulo ? { 'aria-labelledby': idRotulo } : { 'aria-label': 'Texto do artigo' }),
      },
    },
    onUpdate: ({ editor: instancia }) => {
      const resultado = conteudoArtigoSchema.safeParse(instancia.getJSON())
      if (resultado.success) {
        setForaDoSchema(null)
        aoAlterar(resultado.data)
      } else {
        setForaDoSchema(resultado.error.issues[0]?.message ?? 'Formatação não aceita.')
      }
    },
  })

  const estado =
    useEditorState({
      editor,
      selector: ({ editor: instancia }) =>
        instancia
          ? {
              paragrafo: instancia.isActive('paragraph'),
              titulo2: instancia.isActive('heading', { level: 2 }),
              titulo3: instancia.isActive('heading', { level: 3 }),
              negrito: instancia.isActive('bold'),
              italico: instancia.isActive('italic'),
              link: instancia.isActive('link'),
              marcadores: instancia.isActive('bulletList'),
              numerada: instancia.isActive('orderedList'),
              tabela: instancia.isActive('table'),
              desfazer: instancia.can().undo(),
              refazer: instancia.can().redo(),
            }
          : null,
    }) ?? ESTADO_INICIAL

  if (!editor) return <div className="h-80 animate-pulse rounded-lg border border-border bg-muted" />

  function abrirLink() {
    if (!editor) return
    setEnderecoLink((editor.getAttributes('link').href as string | undefined) ?? '')
    setErroLink(null)
    setLinkAberto(true)
  }

  function aplicarLink() {
    if (!editor) return
    const href = enderecoLink.trim()
    if (!href) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setLinkAberto(false)
      return
    }
    if (!enderecoLinkSchema.safeParse(href).success) {
      setErroLink('Use um caminho interno (/profissionais) ou um link https://, mailto: ou tel:.')
      return
    }
    const interno = href.startsWith('/')
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href, target: interno ? null : '_blank', rel: interno ? null : 'noopener noreferrer nofollow' })
      .run()
    setLinkAberto(false)
  }

  async function inserirImagem() {
    const arquivo = arquivoRef.current?.files?.[0]
    if (!editor || !arquivo) {
      toast.error('Selecione uma imagem.')
      return
    }
    const alt = textoAlternativo.trim()
    if (alt.length < 3) {
      toast.error('Descreva a imagem (texto alternativo) para quem usa leitor de tela.')
      return
    }
    setEnviandoImagem(true)
    setErroImagem(null)
    try {
      // Mesmo envio da capa: arquivo original, mensagens específicas.
      const resultado = await enviarImagemDoNavegador(arquivo)
      if (!resultado.ok) {
        setErroImagem(resultado.mensagem)
        return
      }
      editor.chain().focus().setImage({ src: resultado.url, alt: alt.slice(0, LIMITES_ARTIGO.capaAlt) }).run()
      setImagemAberta(false)
      setTextoAlternativo('')
    } finally {
      setEnviandoImagem(false)
    }
  }

  const botoes: Array<{ rotulo: string; Icone: LucideIcon; ativo: boolean; executar: () => void; desabilitado?: boolean }> = [
    { rotulo: 'Parágrafo', Icone: Pilcrow, ativo: estado.paragrafo, executar: () => editor.chain().focus().setParagraph().run() },
    { rotulo: 'Título de seção', Icone: Heading2, ativo: estado.titulo2, executar: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { rotulo: 'Subtítulo', Icone: Heading3, ativo: estado.titulo3, executar: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { rotulo: 'Negrito', Icone: Bold, ativo: estado.negrito, executar: () => editor.chain().focus().toggleBold().run() },
    { rotulo: 'Itálico', Icone: Italic, ativo: estado.italico, executar: () => editor.chain().focus().toggleItalic().run() },
    { rotulo: 'Link', Icone: Link2, ativo: estado.link, executar: abrirLink },
    { rotulo: 'Lista com marcadores', Icone: List, ativo: estado.marcadores, executar: () => editor.chain().focus().toggleBulletList().run() },
    { rotulo: 'Lista numerada', Icone: ListOrdered, ativo: estado.numerada, executar: () => editor.chain().focus().toggleOrderedList().run() },
    { rotulo: 'Inserir imagem', Icone: ImagePlus, ativo: false, executar: () => { setErroImagem(null); setImagemAberta(true) } },
    {
      rotulo: 'Inserir tabela',
      Icone: Table2,
      ativo: estado.tabela,
      executar: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      desabilitado: estado.tabela,
    },
    { rotulo: 'Desfazer', Icone: Undo2, ativo: false, executar: () => editor.chain().focus().undo().run(), desabilitado: !estado.desfazer },
    { rotulo: 'Refazer', Icone: Redo2, ativo: false, executar: () => editor.chain().focus().redo().run(), desabilitado: !estado.refazer },
  ]

  // Operações de tabela só aparecem com o cursor dentro de uma.
  const botoesTabela: Array<{ rotulo: string; Icone: LucideIcon; executar: () => void }> = [
    { rotulo: 'Adicionar linha', Icone: Rows3, executar: () => editor.chain().focus().addRowAfter().run() },
    { rotulo: 'Adicionar coluna', Icone: Columns3, executar: () => editor.chain().focus().addColumnAfter().run() },
    { rotulo: 'Remover linha', Icone: Rows3, executar: () => editor.chain().focus().deleteRow().run() },
    { rotulo: 'Remover coluna', Icone: Columns3, executar: () => editor.chain().focus().deleteColumn().run() },
    { rotulo: 'Remover tabela', Icone: Trash2, executar: () => editor.chain().focus().deleteTable().run() },
  ]

  return (
    <div className="space-y-2">
      <div className={cn('overflow-hidden rounded-lg border border-input bg-background', desabilitado && 'opacity-70')}>
        <div role="toolbar" aria-label="Formatação do artigo" className="flex flex-wrap gap-1 border-b border-border bg-muted/50 p-2">
          {botoes.map(({ rotulo, Icone, ativo, executar, desabilitado: botaoDesabilitado }) => (
            <Button
              key={rotulo}
              type="button"
              size="icon"
              variant={ativo ? 'secondary' : 'ghost'}
              aria-label={rotulo}
              aria-pressed={ativo}
              title={rotulo}
              disabled={desabilitado || botaoDesabilitado}
              onClick={executar}
            >
              <Icone className="size-4" />
            </Button>
          ))}
        </div>
        {estado.tabela && !desabilitado ? (
          <div role="toolbar" aria-label="Tabela" className="flex flex-wrap gap-1 border-b border-border bg-primary/5 p-2">
            {botoesTabela.map(({ rotulo, Icone, executar }) => (
              <Button key={rotulo} type="button" size="sm" variant="ghost" onClick={executar} className="gap-1.5 text-xs">
                <Icone className="size-3.5" aria-hidden /> {rotulo}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      </div>

      {foraDoSchema && (
        <p role="alert" className="text-sm text-destructive">
          A última alteração não foi aplicada ao rascunho: {foraDoSchema} Desfaça (Ctrl+Z) e tente de novo. Imagens
          precisam ser enviadas pelo botão de imagem.
        </p>
      )}

      <ModalResponsivo
        aberto={linkAberto}
        onFechar={() => setLinkAberto(false)}
        titulo="Link"
        descricao="Caminho interno (/profissionais) ou endereço completo. Deixe vazio para remover o link."
        largura="md"
        rodape={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setLinkAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={aplicarLink}>
              Aplicar
            </Button>
          </div>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="artigo-endereco-link">Endereço</Label>
          <Input
            id="artigo-endereco-link"
            value={enderecoLink}
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            aria-invalid={Boolean(erroLink)}
            onChange={(evento) => {
              setEnderecoLink(evento.target.value)
              setErroLink(null)
            }}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') {
                evento.preventDefault()
                aplicarLink()
              }
            }}
          />
          {erroLink && <p className="text-sm text-destructive">{erroLink}</p>}
        </div>
      </ModalResponsivo>

      <ModalResponsivo
        aberto={imagemAberta}
        onFechar={() => setImagemAberta(false)}
        titulo="Inserir imagem"
        descricao="JPG, PNG ou WEBP de até 5 MB. A imagem fica pública depois que o artigo for aprovado."
        largura="md"
        rodape={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setImagemAberta(false)} disabled={enviandoImagem}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void inserirImagem()} disabled={enviandoImagem}>
              {enviandoImagem ? 'Enviando…' : 'Inserir'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="artigo-imagem-arquivo">Arquivo</Label>
            <Input id="artigo-imagem-arquivo" ref={arquivoRef} type="file" accept={IMAGEM_ARTIGO.tipos.join(',')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="artigo-imagem-alt">Descrição da imagem</Label>
            <Input
              id="artigo-imagem-alt"
              value={textoAlternativo}
              maxLength={LIMITES_ARTIGO.capaAlt}
              placeholder="Ex.: Tabela com as faixas do Simples Nacional"
              onChange={(evento) => setTextoAlternativo(evento.target.value)}
            />
          </div>
          {erroImagem ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {erroImagem}
            </p>
          ) : null}
        </div>
      </ModalResponsivo>
    </div>
  )
}
