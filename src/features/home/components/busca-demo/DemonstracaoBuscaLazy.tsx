"use client";

import dynamic from "next/dynamic";

/**
 * Carregamento sob demanda da demonstração de busca.
 *
 * O palco traz o perfil público completo (`PerfilProfissionalV2`) e a vitrine;
 * nada disso precisa estar no primeiro carregamento da Home. Sem SSR: a janela
 * virtual depende da largura real do aparelho, conhecida só no navegador. O
 * espaço reservado evita salto de layout enquanto o pedaço carrega.
 */
const DemonstracaoBuscaProfissionais = dynamic(
  () => import("./DemonstracaoBuscaProfissionais").then((m) => m.DemonstracaoBuscaProfissionais),
  {
    ssr: false,
    loading: () => <div className="min-h-[60rem] border-y border-border bg-muted/20 sm:min-h-[56rem]" aria-hidden="true" />,
  },
);

export function DemonstracaoBuscaLazy() {
  return <DemonstracaoBuscaProfissionais />;
}
