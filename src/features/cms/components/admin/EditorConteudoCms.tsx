'use client'

import { useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Redo2,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { ModalResponsivo } from '@/components/shared/ModalResponsivo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  conteudoPaginaSchema,
  enderecoLinkSchema,
  type NoConteudo,
} from '../../nucleo/conteudo/schema'

/**
 * Editor de conteúdo do CMS (TipTap), só para a Gestão.
 *
 * Carregado sob demanda (`next/dynamic`, sem SSR) pelo formulário: o código do
 * editor não entra no pacote de nenhuma página pública.
 *
 * As extensões ligadas são exatamente os nós e marcas do schema fechado do
 * núcleo. O StarterKit traz mais coisa — sublinhado, tachado, código, citação,
 * linha horizontal, quebra de linha —, e tudo isso fica desligado: um atalho
 * de teclado (Ctrl+U) ou um texto colado não conseguem produzir formatação que
 * o servidor recusaria. Colar de outro site passa pelo mesmo filtro: o que não
 * tem extensão some na colagem.
 *
 * Se mesmo assim o documento sair do schema, a mudança não sobe para o
 * formulário e o editor avisa — nada de descartar em silêncio.
 */
const ESTADO_INICIAL = {
  paragrafo: false,
  titulo1: false,
  titulo2: false,
  titulo3: false,
  negrito: false,
  italico: false,
  link: false,
  marcadores: false,
  numerada: false,
  desfazer: false,
  refazer: false,
}

type Propriedades = {
  valor: NoConteudo
  aoAlterar: (valor: NoConteudo) => void
  desabilitado?: boolean
  idRotulo?: string
}

export default function EditorConteudoCms({
  valor,
  aoAlterar,
  desabilitado = false,
  idRotulo,
}: Propriedades) {
  const [foraDoSchema, setForaDoSchema] = useState(false)
  const [linkAberto, setLinkAberto] = useState(false)
  const [enderecoLink, setEnderecoLink] = useState('')
  const [erroLink, setErroLink] = useState<string | null>(null)

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
        heading: { levels: [1, 2, 3] },
        link: {
          autolink: false,
          linkOnPaste: false,
          openOnClick: false,
          defaultProtocol: 'https',
          protocols: ['mailto', 'tel'],
        },
      }),
    ],
    content: valor,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-64 px-4 py-3 text-base leading-7 text-foreground focus:outline-none',
          '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-xl [&_h2]:font-semibold',
          '[&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold',
          '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4',
        ),
        role: 'textbox',
        'aria-multiline': 'true',
        ...(idRotulo ? { 'aria-labelledby': idRotulo } : { 'aria-label': 'Conteúdo da página' }),
      },
    },
    onUpdate: ({ editor: instancia }) => {
      const resultado = conteudoPaginaSchema.safeParse(instancia.getJSON())
      setForaDoSchema(!resultado.success)
      if (resultado.success) aoAlterar(resultado.data)
    },
  })

  // Estado dos botões lido de forma reativa: a barra acende conforme o cursor.
  // Até o editor existir (ele nasce depois da hidratação), tudo apagado.
  const estado = useEditorState({
    editor,
    selector: ({ editor: instancia }) =>
      instancia
        ? {
            paragrafo: instancia.isActive('paragraph'),
            titulo1: instancia.isActive('heading', { level: 1 }),
            titulo2: instancia.isActive('heading', { level: 2 }),
            titulo3: instancia.isActive('heading', { level: 3 }),
            negrito: instancia.isActive('bold'),
            italico: instancia.isActive('italic'),
            link: instancia.isActive('link'),
            marcadores: instancia.isActive('bulletList'),
            numerada: instancia.isActive('orderedList'),
            desfazer: instancia.can().undo(),
            refazer: instancia.can().redo(),
          }
        : null,
  }) ?? ESTADO_INICIAL

  if (!editor)
    return <div className="h-72 animate-pulse rounded-lg border border-border bg-muted" />

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
      setErroLink('Use um caminho interno (/precos) ou um link https://, mailto: ou tel:.')
      return
    }
    // Caminho interno abre na mesma aba; endereço externo, em outra.
    const interno = href.startsWith('/')
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({
        href,
        target: interno ? null : '_blank',
        rel: interno ? null : 'noopener noreferrer nofollow',
      })
      .run()
    setLinkAberto(false)
  }

  const botoes: Array<{
    rotulo: string
    Icone: LucideIcon
    ativo: boolean
    executar: () => void
    desabilitado?: boolean
  }> = [
    {
      rotulo: 'Parágrafo',
      Icone: Pilcrow,
      ativo: estado.paragrafo,
      executar: () => editor.chain().focus().setParagraph().run(),
    },
    {
      rotulo: 'Título 1',
      Icone: Heading1,
      ativo: estado.titulo1,
      executar: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      rotulo: 'Título 2',
      Icone: Heading2,
      ativo: estado.titulo2,
      executar: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      rotulo: 'Título 3',
      Icone: Heading3,
      ativo: estado.titulo3,
      executar: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      rotulo: 'Negrito',
      Icone: Bold,
      ativo: estado.negrito,
      executar: () => editor.chain().focus().toggleBold().run(),
    },
    {
      rotulo: 'Itálico',
      Icone: Italic,
      ativo: estado.italico,
      executar: () => editor.chain().focus().toggleItalic().run(),
    },
    { rotulo: 'Link', Icone: Link2, ativo: estado.link, executar: abrirLink },
    {
      rotulo: 'Lista com marcadores',
      Icone: List,
      ativo: estado.marcadores,
      executar: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      rotulo: 'Lista numerada',
      Icone: ListOrdered,
      ativo: estado.numerada,
      executar: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      rotulo: 'Desfazer',
      Icone: Undo2,
      ativo: false,
      executar: () => editor.chain().focus().undo().run(),
      desabilitado: !estado.desfazer,
    },
    {
      rotulo: 'Refazer',
      Icone: Redo2,
      ativo: false,
      executar: () => editor.chain().focus().redo().run(),
      desabilitado: !estado.refazer,
    },
  ]

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-input bg-background',
          desabilitado && 'opacity-70',
        )}
      >
        <div
          role="toolbar"
          aria-label="Formatação do conteúdo"
          className="flex flex-wrap gap-1 border-b border-border bg-muted/50 p-2"
        >
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
        <EditorContent editor={editor} />
      </div>

      {foraDoSchema && (
        <p role="alert" className="text-sm text-destructive">
          A última alteração gerou uma formatação que o site não aceita e não foi aplicada ao
          rascunho. Desfaça (Ctrl+Z) e tente de novo.
        </p>
      )}

      <ModalResponsivo
        aberto={linkAberto}
        onFechar={() => setLinkAberto(false)}
        titulo="Link"
        descricao="Caminho interno (/precos) ou endereço completo. Deixe vazio para remover o link."
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
          <Label htmlFor="cms-endereco-link">Endereço</Label>
          <Input
            id="cms-endereco-link"
            value={enderecoLink}
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            aria-invalid={Boolean(erroLink)}
            aria-describedby={erroLink ? 'cms-endereco-link-erro' : undefined}
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
          {erroLink && (
            <p id="cms-endereco-link-erro" className="text-sm text-destructive">
              {erroLink}
            </p>
          )}
        </div>
      </ModalResponsivo>
    </div>
  )
}
