import { Check } from "lucide-react";
import { atendimentosDemo, especialistasDemo } from "../../constants/demonstracao";
import { Personagem } from "./Personagem";

export function EspecialistasDemo({ foco, etapa, escolhido, selecionar }: { foco: number; etapa: number; escolhido: number | null; selecionar: (indice: number) => void }) {
  return <div className="viva-opcoes">
    <p>Vincis encontrou<br /><strong>especialistas para você</strong></p>
    <div className="viva-cards">
      {especialistasDemo.map((item, indice) => <button type="button" key={item.nome} aria-label={`Selecionar ${item.nome}`} aria-pressed={escolhido === indice} disabled={etapa !== 2} onClick={() => selecionar(indice)} className={`viva-card ${escolhido === indice ? "selecionado" : escolhido !== null ? "secundario" : "neutro"}`}>
        <span className="viva-retrato"><Personagem asset={item.asset} /></span>
        <span className="viva-estrelas" aria-label="Avaliação fictícia: 5 estrelas">★★★★★</span>
        <strong>{atendimentosDemo[foco].especialidades[indice]}</strong>
        <span className="viva-card-detalhe">{item.nome}<br />{item.local}<br />{item.experiencia}</span>
        <span className="viva-selecionar">{escolhido === indice ? <><Check size={12} /> Escolhido</> : etapa === 1 ? "Aguardando escolha" : "Selecionar"}</span>
      </button>)}
    </div>
    <small>Parceiros independentes · escolha do cliente</small>
  </div>;
}
