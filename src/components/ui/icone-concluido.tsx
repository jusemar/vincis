import { cn } from "@/lib/utils"

/**
 * O selo de "concluído" da Vincis: círculo verde cheio com check branco.
 *
 * Nasceu no passo concluído da `Trilha` (Detalhes → Pagamento → Concluído) e
 * virou peça única para que todo "pronto" da plataforma tenha a mesma cara —
 * hoje também o balão de resposta da animação da Home.
 *
 * O check é branco **explícito** (`text-white`). Antes ele usava
 * `text-success-foreground`, classe que não existe no Tailwind do projeto: o
 * traço herdava a cor do texto ao redor e só saía branco no tema escuro.
 *
 * Decorativo por padrão (`aria-hidden`): quem o usa já diz "concluído" em texto.
 * O tamanho vem por `className` (padrão `size-5`, o da Trilha); o check ocupa
 * sempre 60% do círculo, então a proporção se mantém em qualquer tamanho.
 */
export function IconeConcluido({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-success bg-success",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className="size-[60%] text-white">
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
