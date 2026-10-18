import type { Metadata } from "next";
import { RedeVincis } from "@/features/home/components/rede/RedeVincis";
import { HomeAntiga } from "@/features/home/components/HomeAntiga";

export const metadata: Metadata = {
  title: "Vincis | Orientação contábil e jurídica online",
  description: "Conecte-se a contadores, advogados e profissionais da área na Vincis.",
};

export default function HomePage() {
  // A demonstração atual ocupa uma única posição, imediatamente antes do Hero antigo.
  return <div className="min-h-dvh">
    <RedeVincis />
    <HomeAntiga />
  </div>;
}
