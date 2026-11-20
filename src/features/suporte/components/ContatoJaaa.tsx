import Image from 'next/image'
import { cn } from '@/lib/utils'
import { CONTATO_OFICIAL_JAAA } from '../lib/canal-suporte'

/**
 * Contato público da Vincis: "Clique e fale conosco." e, logo abaixo, o
 * contato compacto do Junior (foto circular + nome), como o chip de pessoa da
 * home do Jaaa.
 *
 * - É um link comum (`<a>`): foto e nome são o próprio alvo do clique, com foco
 *   por teclado, leitor de tela e toque. Não há botão "Conversar" nem formulário.
 * - Abre o Jaaa em outra aba, para quem está na Vincis não perder a página.
 * - Ocupa só a largura do conteúdo (`inline-flex`), sem cartão.
 * - Componente de servidor: não usa estado, então funciona dentro de
 *   componentes de cliente (rodapé) e de servidor (página Contato).
 */
export function ContatoJaaa({ className }: { className?: string }) {
  const { nome, nomeUsuario, href, fotoSrc } = CONTATO_OFICIAL_JAAA

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <p className="text-sm text-muted-foreground">Clique e fale conosco.</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Conversar com ${nome} (@${nomeUsuario}) no Jaaa`}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-card py-1 pr-4 pl-1 text-sm font-semibold text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
      >
        <Image
          src={fotoSrc}
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-full object-cover"
        />
        <span className="truncate">{nome}</span>
      </a>
    </div>
  )
}
