"use client";

import type { CardHomePublicoDTO } from "@/features/cms/types";
import ChatDemo from "./ChatDemo";
import Banners from "./Banners";
import ServicesHub from "./ServicesHub";

/**
 * Ordem e componentes da HOME em 47e3fba5; a Rede Vincis é montada antes daqui.
 * Os cards de serviço chegam do servidor (CMS), lidos em `src/app/page.tsx`.
 * "Resolva em 3 passos simples" saiu: o passo a passo agora é a demonstração
 * animada "Seu profissional, passo a passo" (`busca-demo/`).
 */
export function HomeAntiga({ cardsServicos }: { cardsServicos: CardHomePublicoDTO[] }) {
  return <>
    <ChatDemo />
    <Banners cards={cardsServicos} />
    <ServicesHub />
  </>;
}
