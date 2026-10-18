"use client";

import { useState, type CSSProperties } from "react";
import { Check, MapPin, Pause, Play, RotateCcw, ArrowDown, FileText } from "lucide-react";
import { atendimentosDemo, etapasDemo, DURACAO_CICLO, INTERVALO_CLIENTES } from "../../constants/demonstracao";
import { ENQUADRAMENTO_MAPA, ENQUADRAMENTO_NUCLEO } from "../../constants/rede-territorial";
import { useDemonstracao } from "../../hooks/useDemonstracao";
import { obterFluxo, obterAtendimentoVisual, obterFocoNarrativo } from "../../lib/fluxo-demonstracao";
import { Conexoes } from "./Conexoes";
import { EspecialistasDemo } from "./EspecialistasDemo";
import { MarcadoresTerritoriais, RedeTerritorial } from "./RedeTerritorial";
import { MapaBrasil } from "./MapaBrasil";
import { Personagem } from "./Personagem";
import { CentralVincis } from "./CentralVincis";
import { ProfissionalRede, ConfirmacaoVincis } from "./ProfissionalRede";
import { TimelineDemo } from "./TimelineDemo";
import "../../styles/demonstracao-viva.css";
import "../../styles/rede-tema.css";

// A base acompanha o mapa: nenhuma coordenada depende da viewport.
// O recorte mobile acompanha a origem do mapa para preservar seu enquadramento.
const viewBoxMapaMobile = `${ENQUADRAMENTO_MAPA.x} 100 730 487`;
const escalaMapa = ENQUADRAMENTO_MAPA.largura / 1536;
const estiloNucleo = {
  left: `${(ENQUADRAMENTO_MAPA.x + ENQUADRAMENTO_NUCLEO.x * escalaMapa) / 10}%`,
  top: `${(ENQUADRAMENTO_MAPA.y + ENQUADRAMENTO_NUCLEO.y * escalaMapa) / 6}%`,
  width: `${ENQUADRAMENTO_NUCLEO.largura * escalaMapa / 10}%`,
};
const estiloNucleoMobile = {
  "--nucleo-left": `${ENQUADRAMENTO_NUCLEO.x / 1536 * 100}%`,
  "--nucleo-top": `${ENQUADRAMENTO_NUCLEO.y / 1024 * 100}%`,
  "--nucleo-width": `${ENQUADRAMENTO_NUCLEO.largura / 1536 * 100}%`,
  "--nucleo-legenda-top": `${(1024 - ENQUADRAMENTO_NUCLEO.y) / (ENQUADRAMENTO_NUCLEO.largura * 2 / 3) * 100}%`,
} as CSSProperties;

type Escolha = { ciclo: number; indice: number };
export function RedeVincis() {
  const { ref, tempo, setTempo, pausado, setPausado, movimentoReduzido, executando } = useDemonstracao();
  const [focoManual, setFoco] = useState<number | null>(null);
  const foco = focoManual ?? obterFocoNarrativo(tempo);
  // No máximo três escolhas em memória, independentemente de quantos loops forem vistos.
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>({});
  const fluxo = obterFluxo(tempo, foco);
  const atendimento = atendimentosDemo[foco];
  const visual = obterAtendimentoVisual(tempo, foco, escolhas, movimentoReduzido);
  const escolhido = visual.escolhido;
  // A saída acompanha o relógio compartilhado para respeitar a pausa.
  const estiloCards = (progresso: number): CSSProperties => ({
    opacity: progresso,
    transform: `translateY(${(1 - progresso) * 30}px) scale(${0.86 + progresso * 0.14})`,
  });
  const navegar = (indice: number) => {
    setFoco(foco);
    setTempo(Math.max(0, fluxo.ciclo) * DURACAO_CICLO + foco * INTERVALO_CLIENTES + (indice === 5 && movimentoReduzido ? 41000 : indice === 1 ? 10500 : indice === 3 ? 19000 : etapasDemo[indice].inicio));
    // Navegação explícita dá tempo de ler; continuar retoma o relógio no mesmo ponto.
    setPausado(true);
    if (indice < 3) setEscolhas((atuais) => {
      const proximas = { ...atuais };
      delete proximas[foco];
      return proximas;
    });
  };
  const selecionar = (indice: number) => setEscolhas((atuais) => ({ ...atuais, [foco]: { ciclo: fluxo.ciclo, indice } }));
  const mensagem = visual.mensagemCliente;
  const viagem = visual.viagem;
  const concluido = visual.concluido;
  const status = concluido ? "Atendimento concluído. O resultado chegou ao cliente." : etapasDemo[Math.max(0, fluxo.etapa)].descricao;
  return <section ref={ref} id="demonstracao" className="viva" aria-label="Como a Vincis funciona" data-executando={executando} data-etapa={fluxo.etapa} data-tempo={tempo}>
    <div className="viva-cabecalho"><span>DA SUA NECESSIDADE À SOLUÇÃO</span><p>Uma rede de especialistas. <strong>Uma conexão feita para você.</strong></p></div>
    <TimelineDemo etapa={fluxo.etapa} navegar={navegar} />
    <div className={`viva-palco ${fluxo.etapa >= 3 ? "viva-rede-aberta" : ""}`}>
      <svg className="viva-mapa-fundo" viewBox="0 0 1000 600" aria-hidden="true"><MapaBrasil /></svg>
      <svg className="viva-mapa" viewBox="0 0 1000 600" role="img" aria-label="Mapa ilustrativo do Brasil com conexões entre clientes, Vincis e parceiros independentes">
        <RedeTerritorial tempo={tempo} reduzido={movimentoReduzido} /><Conexoes tempo={tempo} reduzido={movimentoReduzido} foco={foco} />
      </svg>
      {atendimentosDemo.map((item, indice) => {
        const estado = obterFluxo(tempo, indice);
        const cena = obterAtendimentoVisual(tempo, indice, escolhas, movimentoReduzido);
        const selecao = cena.escolhido;
        const profissional = cena.profissional;
        const finalizado = cena.concluido;
        return <div key={item.nome}>
          {estado.etapa >= 0 && <div className={`viva-cliente viva-cliente-${indice} ${indice === foco ? "viva-em-foco" : "viva-segundo-plano"} ${cena.clienteEmAtividade ? "viva-personagem-em-atividade" : ""}`} data-atividade={cena.clienteEmAtividade ? "on" : "off"} style={{ "--cor-fluxo": item.cor } as CSSProperties}>
            <button type="button" className="viva-local" onClick={() => setFoco(indice)} aria-label={`Acompanhar ${item.nome}, ${item.local}`} aria-pressed={foco === indice}><MapPin size={19} /><span>{item.local}<small>Cliente</small></span></button>
            <div className={`viva-balao ${finalizado ? "viva-concluido" : ""}`}>{finalizado && <Check size={17} />}{finalizado && <small>Resposta de {profissional.nome}</small>}{cena.mensagemCliente}{estado.local < 3200 && !movimentoReduzido && <span className="viva-cursor">|</span>}</div>
            <Personagem asset={item.asset} trabalhando={cena.digitando && executando && indice === foco} />
          </div>}
          {indice !== foco && cena.cardsVisiveis && <div className={`viva-mini viva-mini-${indice < foco ? indice + 1 : indice}`} style={estiloCards(cena.progressoCards)}><span className="viva-mini-local">{item.local}</span><EspecialistasDemo foco={indice} etapa={estado.etapa} escolhido={selecao} selecionar={(opcao) => setEscolhas((atuais) => ({ ...atuais, [indice]: { ciclo: estado.ciclo, indice: opcao } }))} /></div>}
          {estado.etapa >= 3 && <div className={`viva-profissional viva-profissional-${indice} ${!cena.profissionalAtivo ? "viva-disponivel" : "viva-profissional-ativo"} ${indice !== foco ? "viva-segundo-plano" : "viva-em-foco"} ${cena.profissionalEmAtividade ? "viva-personagem-em-atividade" : ""}`} data-atividade={cena.profissionalEmAtividade ? "on" : "off"}>
            <ProfissionalRede visual={cena} executando={executando && indice === foco} />
          </div>}
        </div>;
      })}
      <div className="viva-central" style={estiloNucleo}>{visual.assistente && <div className="viva-balao viva-balao-assistente"><small>Vincis</small>{visual.assistente}</div>}<CentralVincis processando={visual.processando} /></div>
      <svg className="viva-marcadores-rede" viewBox="0 0 1000 600" aria-hidden="true"><MarcadoresTerritoriais tempo={tempo} reduzido={movimentoReduzido} /></svg>
      {visual.cardsVisiveis && <div className="viva-especialistas" style={estiloCards(visual.progressoCards)} data-recolhendo={visual.recolhendo}><EspecialistasDemo foco={foco} etapa={fluxo.etapa} escolhido={escolhido} selecionar={selecionar} /></div>}
      <span className="viva-mapa-nota"><i className="viva-legenda-cliente" /> Clientes <i className="viva-legenda-profissional" /> Profissionais · posições ilustrativas</span>
    </div>
    <div className="viva-mobile">
      <div className={`viva-mobile-cliente ${visual.clienteEmAtividade ? "viva-personagem-em-atividade" : ""}`} data-atividade={visual.clienteEmAtividade ? "on" : "off"}><span className="viva-local"><MapPin size={17} />{atendimento.local} · Cliente</span><div className="viva-balao">{concluido && <Check size={17} />}{mensagem}</div><Personagem asset={atendimento.asset} trabalhando={fluxo.local < 4000 && executando} /></div>
      <div className="viva-mobile-trajeto" data-retorno={fluxo.etapa === 5}><ArrowDown size={18} /><span>{concluido ? "Resultado recebido" : fluxo.etapa === 5 ? "Resultado a caminho de você" : "Sua necessidade chega à Vincis"}</span>{viagem && !movimentoReduzido && (viagem.trecho === "entrada" || viagem.trecho === "entrega") && <FileText className="viva-documento-mobile" size={24} style={{ top: `${(viagem.trecho === "entrega" ? 1 - viagem.progresso : viagem.progresso) * 100}%` }} />}</div>
      {visual.assistente && <div className="viva-balao viva-mobile-assistente"><small>Vincis</small>{visual.assistente}</div>}<div className="viva-mobile-nucleo" style={estiloNucleoMobile}>
        <svg className="viva-mapa-fundo" viewBox={viewBoxMapaMobile} aria-hidden="true"><MapaBrasil /></svg>
        <svg className="viva-mapa-mobile" viewBox={viewBoxMapaMobile} role="img" aria-label="Rede nacional: clientes em ciano e profissionais em dourado">
          <RedeTerritorial tempo={tempo} reduzido={movimentoReduzido} />
        </svg>
        <CentralVincis processando={visual.processando} />
        <svg className="viva-marcadores-rede" viewBox={viewBoxMapaMobile} aria-hidden="true"><MarcadoresTerritoriais tempo={tempo} reduzido={movimentoReduzido} /></svg>
      </div>
      <span className="viva-legenda-mobile"><i className="viva-legenda-cliente" /> Clientes <i className="viva-legenda-profissional" /> Profissionais</span>
      {visual.cardsVisiveis && <div style={estiloCards(visual.progressoCards)}><EspecialistasDemo foco={foco} etapa={fluxo.etapa} escolhido={escolhido} selecionar={selecionar} /></div>}
      {fluxo.etapa >= 3 && <><div className="viva-mobile-trajeto" data-retorno={fluxo.etapa === 5}><ArrowDown size={18} /><span>{fluxo.etapa === 5 ? "O resultado volta à Vincis" : "Vincis conecta ao profissional"}</span>{viagem && !movimentoReduzido && (viagem.trecho === "retorno" || viagem.trecho === "encaminhamento") && <FileText className="viva-documento-mobile" size={24} style={{ top: `${(viagem.trecho === "retorno" ? 1 - viagem.progresso : viagem.progresso) * 100}%` }} />}</div><div className={`viva-mobile-parceiro ${visual.profissionalEmAtividade ? "viva-personagem-em-atividade" : ""}`} data-atividade={visual.profissionalEmAtividade ? "on" : "off"}><ProfissionalRede visual={visual} executando={executando} /></div></>}
    </div>
    <div className="viva-rodape"><div className="viva-status" aria-live={pausado || movimentoReduzido ? "polite" : "off"}><span className={concluido ? "viva-confirmacao-status" : "viva-ponto"}>{concluido && <ConfirmacaoVincis />}</span>{status}</div><div className="viva-controles">
      {!movimentoReduzido && <button type="button" aria-label={pausado ? "Continuar demonstração" : "Pausar demonstração"} onClick={() => setPausado(!pausado)}>{pausado ? <Play size={14} /> : <Pause size={14} />}<span>{pausado ? "Continuar" : "Pausar"}</span></button>}
      <button type="button" aria-label="Reiniciar demonstração" onClick={() => { setTempo(0); setFoco(null); setEscolhas({}); setPausado(false); }}><RotateCcw size={14} /><span>Reiniciar</span></button>
    </div></div>
    <div className="viva-atendimentos" aria-label="Atendimento em foco">{atendimentosDemo.map((item, indice) => <button key={item.nome} type="button" aria-pressed={foco === indice} onClick={() => { setFoco(indice); if (obterFluxo(tempo, indice).etapa < 0) { setTempo(indice * INTERVALO_CLIENTES); setPausado(true); } }}><span style={{ background: item.cor }} />{item.local}<small>{obterFluxo(tempo, indice).etapa < 0 ? "Em breve" : etapasDemo[obterFluxo(tempo, indice).etapa].curto}</small></button>)}</div>
    <p className="viva-aviso">Demonstração ilustrativa. Perfis e avaliações fictícios. Os profissionais são parceiros independentes.{movimentoReduzido && " Movimento reduzido ativo: navegue pelas seis etapas no seu ritmo."}</p>
  </section>;
}
