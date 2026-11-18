"use client";

import { Headset, Menu, X } from "lucide-react";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { BotoesAuth } from "@/features/usuarios";

/**
 * Espelho do cabeçalho público (`components/shared/NavigationNext.tsx`).
 *
 * Por que espelho, e não o componente real: o `NavigationNext` é `fixed` na
 * janela, escuta a rolagem da página, abre os modais reais de login e reage a
 * `?entrar=1`. Uma segunda instância dentro da demonstração abriria modais de
 * verdade e disputaria a rolagem com o cabeçalho de cima. Aqui ficam as mesmas
 * classes e os mesmos links, só que `absolute` dentro da janela virtual e sem
 * nenhum comportamento. `ThemeToggle` e `BotoesAuth` são os reais, inertes
 * (o palco inteiro tem `inert`).
 *
 * Se o cabeçalho real mudar de visual, este espelho precisa acompanhar.
 */

/** Os mesmos links fixos do cabeçalho real, na mesma ordem. */
const LINKS = ["Início", "Profissionais", "Parceiros", "Preços"];

const nada = () => undefined;

export function CabecalhoEspelho({
  rolado,
  menuAberto,
  ativo,
}: {
  /** Página rolada: o cabeçalho real ganha o fundo `glass`. */
  rolado: boolean;
  /** Menu do celular aberto (só existe abaixo de `lg`). */
  menuAberto: boolean;
  /** Link sublinhado como ativo, igual ao `isLinkActive` real. */
  ativo: "Início" | "Profissionais";
}) {
  return (
    <>
      <nav
        className={`absolute left-0 right-0 top-0 z-50 transition-all duration-500 ${
          rolado ? "glass py-3" : "bg-transparent py-5"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="group flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-gold shadow-glow">
                <span className="text-xl font-bold text-navy-900">V</span>
              </div>
              <span className="text-xl font-bold text-foreground">Vincis</span>
            </div>

            <div className="hidden items-center gap-1 lg:flex">
              {LINKS.map((nome) => (
                <span
                  key={nome}
                  data-demo-alvo={nome === "Profissionais" ? "link-profissionais" : undefined}
                  className="relative px-4 py-2 text-sm font-medium text-muted-foreground"
                >
                  {nome}
                  <span
                    className={`absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 bg-primary transition-all duration-300 ${
                      ativo === nome ? "w-1/2" : "w-0"
                    }`}
                  />
                </span>
              ))}
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <span className="p-2 text-foreground/70">
                <Headset className="h-5 w-5" />
              </span>
              <ThemeToggle />
              <BotoesAuth onAbrirEntrar={nada} onAbrirCadastro={nada} />
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <ThemeToggle />
              <span
                data-demo-alvo="menu-mobile"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-foreground"
              >
                {menuAberto ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </span>
            </div>
          </div>
        </div>
      </nav>

      {menuAberto && (
        <div className="absolute inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />
          <div className="glass-card absolute left-4 right-4 top-20 rounded-2xl p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              {LINKS.map((nome) => (
                <span
                  key={nome}
                  data-demo-alvo={nome === "Profissionais" ? "link-profissionais-mobile" : undefined}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-muted-foreground"
                >
                  {nome}
                </span>
              ))}
              <BotoesAuth variant="mobile" onAbrirEntrar={nada} onAbrirCadastro={nada} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
