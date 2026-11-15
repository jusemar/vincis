import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/*
  Feedback de clique compartilhado: `active:scale` dá a resposta tátil do
  toque/clique, e `aria-busy` (botão em processamento) troca o cursor e
  bloqueia novos cliques sem esmaecer a cor — processando não é desativado.

  O botão primário desativado deixa de ser "o mesmo âmbar a 50%" (que parecia
  habilitado e apagado ao mesmo tempo) e passa a usar o neutro do tema, para
  a diferença entre pronto e indisponível ser evidente nos dois temas.
*/
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all cursor-pointer active:scale-[0.97] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-busy:pointer-events-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 hover:shadow-sm disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function bloquearClique(evento: React.MouseEvent<HTMLButtonElement>) {
  evento.preventDefault()
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  carregando = false,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Processando uma ação: mostra o indicador, marca `aria-busy` e ignora
     * novos cliques (inclusive submit de formulário), sem o visual de
     * desativado. Evita envio duplicado sem parecer que o botão "morreu".
     */
    carregando?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      aria-busy={carregando || undefined}
      aria-disabled={carregando || props["aria-disabled"]}
      // Só troca o handler quando está processando: o Button também é usado
      // em Server Components, onde não pode existir função criada aqui.
      onClick={carregando ? bloquearClique : onClick}
      {...props}
    >
      {/*
        Com `asChild` o Slot do Radix exige exatamente um filho — nem um `null`
        ao lado —, então o indicador só entra no botão nativo.
      */}
      {asChild ? (
        children
      ) : (
        <>
          {carregando ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
