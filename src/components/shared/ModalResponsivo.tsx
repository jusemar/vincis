"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Casca única dos modais da Vincis.
 *
 * Existe porque a plataforma tinha vários overlays escritos à mão no mesmo
 * padrão `fixed inset-0 flex items-center justify-center`. Esse padrão centraliza
 * o painel mas não cria contexto de rolagem: quando o conteúdo fica mais alto que
 * o viewport ele transborda para os dois lados e some — o topo sai por cima, o
 * rodapé por baixo, e nenhum dos dois é alcançável. Foi exatamente assim que o
 * botão "Criar minha conta" ficou inacessível em telas de pouca altura.
 *
 * A casca resolve o problema pela estrutura, e não por tamanho:
 *
 * - o painel tem altura MÁXIMA (`dvh`, que acompanha as barras do navegador
 *   móvel), nunca altura fixa;
 * - o miolo é o único trecho rolável, então o cabeçalho e a ação permanecem
 *   visíveis mesmo com o teclado virtual aberto;
 * - a ação principal fica numa barra inferior que respeita a safe area;
 * - no celular vira folha de baixo (padrão de aplicativo), no desktop continua
 *   como diálogo centralizado.
 *
 * Radix cuida de foco, ESC, aria e trava de rolagem do fundo.
 */

type ModalResponsivoProps = {
  aberto: boolean;
  onFechar: () => void;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** Conteúdo rolável. */
  children: React.ReactNode;
  /** Barra de ação inferior — fica fora da rolagem, sempre alcançável. */
  rodape?: React.ReactNode;
  /** Slot à esquerda do título (ex.: "Voltar"). */
  acaoCabecalho?: React.ReactNode;
  /** Largura máxima no desktop. */
  largura?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  className?: string;
  /** Some com o título visualmente, mantendo-o para leitores de tela. */
  tituloOculto?: boolean;
};

const LARGURAS: Record<NonNullable<ModalResponsivoProps["largura"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
};

export function ModalResponsivo({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  rodape,
  acaoCabecalho,
  largura = "lg",
  className,
  tituloOculto = false,
}: ModalResponsivoProps) {
  return (
    <DialogPrimitive.Root
      open={aberto}
      onOpenChange={(estado) => {
        if (!estado) onFechar();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />

        <DialogPrimitive.Content
          className={cn(
            // Celular: folha ancorada na base, com teto de altura em `dvh`.
            "fixed inset-x-0 bottom-0 z-[60] flex max-h-[92dvh] w-full flex-col overflow-hidden",
            "rounded-t-3xl border border-b-0 border-border/50 bg-card shadow-2xl outline-none",
            // Desktop: `inset-0 + m-auto + h-fit` centraliza sem `translate`,
            // que quebraria a rolagem interna, e o teto vira 88dvh.
            "sm:inset-0 sm:bottom-auto sm:m-auto sm:h-fit sm:max-h-[88dvh] sm:rounded-2xl sm:border-b",
            LARGURAS[largura],
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0",
            className,
          )}
        >
          {/* Alça: sinaliza no celular que o painel é uma folha arrastável. */}
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />

          <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-3 sm:px-7 sm:pt-6">
            <div className="min-w-0 flex-1">
              {acaoCabecalho ? <div className="mb-2">{acaoCabecalho}</div> : null}
              <DialogPrimitive.Title
                className={cn(
                  "font-serif text-xl font-bold leading-tight text-foreground sm:text-2xl",
                  tituloOculto && "sr-only",
                )}
              >
                {titulo}
              </DialogPrimitive.Title>
              {descricao ? (
                <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {descricao}
                </DialogPrimitive.Description>
              ) : (
                // Radix avisa no console quando não há descrição associada.
                <DialogPrimitive.Description className="sr-only">
                  {typeof titulo === "string" ? titulo : "Janela"}
                </DialogPrimitive.Description>
              )}
            </div>

            {/* 44px de alvo de toque, mesmo com ícone de 20px. */}
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>

          {/* Único trecho rolável do painel. */}
          <div className="rolagem-contida min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
            {children}
          </div>

          {rodape ? (
            <div className="pb-safe-4 shrink-0 border-t border-border/50 bg-card/95 px-5 pt-4 backdrop-blur sm:px-7 sm:pb-6">
              {rodape}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
