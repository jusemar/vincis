"use client";

import { type ReactNode } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/features/usuarios";
import { EmpresaProvider } from "@/features/empresas";
import { Toaster } from "@/components/ui/sonner";
import { TempoRealDaSessao } from "@/features/tempo-real/components/TempoRealDaSessao";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TempoRealDaSessao>
          <EmpresaProvider>{children}</EmpresaProvider>
        </TempoRealDaSessao>
      </AuthProvider>
      {/*
        `richColors` é o que dá a cada variante do Sonner a cor suave e o ícone
        do design system — verde para sucesso, âmbar para atenção, vermelho para
        erro, neutro para informação. Quem escolhe a variante é quem chama o
        toast, pela semântica da mensagem; nenhuma paleta paralela existe.

        `visibleToasts` limita a pilha: numa rajada de avisos (uma conversa
        animada, vários eventos de um mesmo Atendimento) os mais antigos saem em
        vez de cobrirem a tela. A duração automática e a pausa no hover são as
        do próprio Sonner.
      */}
      <Toaster richColors position="top-right" visibleToasts={3} />
    </ThemeProvider>
  );
}
