import { Check, MapPin } from "lucide-react";
import type { AtendimentoVisual } from "../../lib/fluxo-demonstracao";
import { IconeConcluido } from "@/components/ui/icone-concluido";
import { Personagem } from "./Personagem";

/**
 * Selo da barra de status da demonstração. O balão de resposta usa o
 * `IconeConcluido` do design system; este continua só no rodapé.
 */
export function ConfirmacaoVincis() {
  return <span className="viva-confirmacao" aria-hidden="true"><Check size={15} strokeWidth={2.5} /></span>;
}

/** Mesma identidade e ordem de leitura no desktop e mobile, sem espelhar o asset. */
export function ProfissionalRede({ visual, executando }: { visual: AtendimentoVisual; executando: boolean }) {
  const { profissional, profissionalAtivo, respondendo, mensagemProfissional, trabalhando } = visual;
  return <>
    <div className="viva-balao viva-balao-profissional">
      <div className="viva-profissional-identidade">
        <strong className="viva-profissional-cidade"><MapPin size={13} aria-hidden="true" />{profissional.local}</strong>
        <span className="viva-profissional-profissao">{profissional.profissao}</span>
        <span className="viva-profissional-classificacao">{profissional.classificacao}</span>
        {profissional.complemento && <span className="viva-profissional-vinculo">{profissional.complemento}</span>}
      </div>
      {profissionalAtivo && <div className="viva-profissional-resposta">
        {/* Mesmo selo de "concluído" do stepper de contratação. */}
        {respondendo && <IconeConcluido className="viva-resposta-concluida" />}
        <span>{mensagemProfissional}</span>
      </div>}
    </div>
    <Personagem asset={profissional.asset} trabalhando={trabalhando && executando} />
  </>;
}
