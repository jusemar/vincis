import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROTULO_MODELO_CONTRATACAO,
  type ModeloContratacao,
} from "../constants/modelo-contratacao";

/**
 * Selo do modelo comercial do contador, igual no card e no perfil público.
 *
 * Discreto de propósito: informa como se contrata e paga, não é selo de
 * qualidade nem indica vínculo com a equipe Vincis. O "✓" só acompanha a
 * Contratação pela Vincis, como no texto aprovado.
 */
export function SeloModeloContratacao({
  modelo,
  className,
}: {
  modelo: ModeloContratacao;
  className?: string;
}) {
  const rotulo = ROTULO_MODELO_CONTRATACAO[modelo];
  return (
    <div className={cn("text-[11px] leading-snug", className)}>
      <p className="flex items-center gap-1 font-semibold text-foreground">
        {modelo === "vincis" ? (
          <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
        ) : null}
        {rotulo.selo}
      </p>
      <p className="text-muted-foreground">{rotulo.descricao}</p>
    </div>
  );
}
