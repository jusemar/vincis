import { ChevronRight } from "lucide-react";
import { etapasDemo } from "../../constants/demonstracao";

export function TimelineDemo({ etapa, navegar }: { etapa: number; navegar: (indice: number) => void }) {
  return <nav className="viva-etapas" aria-label="Etapas da demonstração">
    {etapasDemo.map((item, indice) => <button type="button" key={item.titulo} aria-current={etapa === indice ? "step" : undefined} onClick={() => navegar(indice)}>
      <span>{indice + 1}</span><strong>{item.titulo}</strong><ChevronRight size={15} aria-hidden="true" />
    </button>)}
  </nav>;
}
