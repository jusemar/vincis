import type { Metadata } from "next";
import { RedeVincis } from "@/features/home/components/rede/RedeVincis";
import { HomeAntiga } from "@/features/home/components/HomeAntiga";
import { listarCardsHomePublicos } from "@/features/cms/queries/cards-home";

export const metadata: Metadata = {
  title: "Vincis | Orientação contábil e jurídica online",
  description: "Conecte-se a contadores, advogados e profissionais da área na Vincis.",
};

export default async function HomePage() {
  // Cards de serviço administrados no CMS (cache etiquetado, invalidado a cada
  // alteração do Gestor). A leitura nunca lança: na falha, a seção não aparece.
  const cardsServicos = await listarCardsHomePublicos();

  // A demonstração atual ocupa uma única posição, imediatamente antes do Hero antigo.
  return <div className="min-h-dvh">
    <RedeVincis />
    <HomeAntiga cardsServicos={cardsServicos} />
  </div>;
}
