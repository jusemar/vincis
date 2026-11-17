import type { CardHomePublicoDTO } from "@/features/cms/types";
import { CardServicoHome } from "./CardServicoHome";

/**
 * Seção de serviços da Home (bento grid): os cards vêm do CMS
 * ("Conteúdo do site" → aba "Cards da Home"), já ativos, com destino no ar e
 * em ordem. O primeiro é o destacado à esquerda; os demais ficam à direita.
 *
 * Quantidades:
 * - 0: a seção não é desenhada (nada inventado para preencher);
 * - 1: o destaque ocupa a largura toda;
 * - 2: o card menor acompanha a altura do destaque, sem buraco embaixo;
 * - 3: o layout original;
 * - 4+: os excedentes continuam a grade de duas colunas.
 */
export default function Banners({ cards }: { cards: CardHomePublicoDTO[] }) {
  const [destaque, ...menores] = cards;
  if (!destaque) return null;

  return (
    <div id="models" className="w-full bg-background py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card grande */}
          <CardServicoHome
            card={destaque}
            variante="destaque"
            href={destaque.href}
            style={{ gridRow: "span 2" }}
            className={cards.length === 1 ? "md:col-span-2" : undefined}
          />

          {/* Cards pequenos */}
          {menores.map((card) => (
            <CardServicoHome
              key={card.id}
              card={card}
              variante="menor"
              href={card.href}
              style={cards.length === 2 ? { gridRow: "span 2" } : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
