"use client";

import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion";
import { MousePointer2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { INTERVALO_DIGITACAO_MS, TERMO_DEMONSTRACAO, type TelaDemonstracao } from "../../constants/demonstracao-busca";
import {
  cameraNeutra,
  dimensoesDoPalco,
  enquadrarCamera,
  resultadoDaBusca,
  type DimensoesPalco,
} from "../../lib/demonstracao-busca";
import type { DadosDemonstracaoBusca } from "../../queries/demonstracao-busca";
import { CabecalhoEspelho } from "./CabecalhoEspelho";
import { TelaHomeDemonstracao, TelaListagemDemonstracao, TelaPerfilDemonstracao } from "./TelasDemonstracao";

/**
 * O palco da demonstração: uma "janela" virtual onde as telas reais são
 * desenhadas, uma câmera (zoom e enquadramento) e um cursor animado.
 *
 * Camadas, de fora para dentro:
 *   1. ajuste — reduz a janela virtual (ex.: 1024px) à largura disponível;
 *   2. câmera — `translate + scale` com origem no canto: amplia um ponto;
 *   3. página — a tela atual, deslocada por `rolagem` (a "rolagem" simulada).
 * O cursor fica FORA da câmera, para manter o tamanho durante o zoom; sua
 * posição na tela é calculada a partir da posição na página e da câmera.
 *
 * Dados: reais e públicos, lidos uma vez no servidor (`queries/
 * demonstracao-busca.ts`) e entregues prontos — a digitação só troca qual
 * resultado já lido é mostrado; nenhuma pesquisa sai do palco.
 *
 * Isolamento: o palco inteiro é `inert` (sem clique, foco nem leitor de tela).
 * Nenhuma contratação, agendamento, gravação ou navegação acontece: o roteiro
 * mexe apenas em estado local.
 */

const SELETOR = {
  linkProfissionais: '[data-demo-alvo="link-profissionais"]',
  menuMobile: '[data-demo-alvo="menu-mobile"]',
  linkProfissionaisMobile: '[data-demo-alvo="link-profissionais-mobile"]',
  campoBusca: 'input[placeholder="Buscar por nome ou especialidade..."]',
  cardSelecionado: '[data-demo-alvo="card-selecionado"] article',
  verPerfil: '[data-demo-alvo="card-selecionado"] footer button',
} as const;

/** Curva única dos movimentos de câmera, rolagem e cursor. */
const CURVA = [0.45, 0, 0.2, 1] as const;
/** Rolagem longa do perfil: começa e termina suave, com velocidade quase constante no meio. */
const CURVA_PERCURSO = [0.3, 0, 0.7, 1] as const;
/**
 * Velocidade da rolagem do perfil, em px virtuais por segundo, e seus limites
 * de duração. No celular o perfil é uma coluna só, bem mais longa: velocidade
 * menor para dar tempo de ler, com teto para a cena não se arrastar.
 */
const VELOCIDADE_PERFIL = { desktop: 260, celular: 230 } as const;
const PERCURSO_MINIMO_S = 8;
const PERCURSO_MAXIMO_S = 24;

/** Altura aproximada do cabeçalho fixo, para não esconder o alvo atrás dele. */
const ALTURA_CABECALHO = 84;

type Retangulo = { x: number; y: number; largura: number; altura: number; cx: number; cy: number };
type Ponto = { x: number; y: number };

class Cancelado extends Error {}
/** Elemento esperado não encontrado: a etapa termina sem travar a reprodução. */
class AlvoAusente extends Error {}

export function PalcoBusca({
  etapa,
  rodada,
  pausado,
  reduzir,
  ativo,
  dados,
  aoConcluirEtapa,
}: {
  etapa: number;
  /** Resultados reais por prefixo do termo e o perfil público do card clicado. */
  dados: DadosDemonstracaoBusca | null;
  /** Muda a cada "repetir" ou navegação manual: reinicia o roteiro da etapa. */
  rodada: number;
  pausado: boolean;
  reduzir: boolean;
  /** Fora da tela, o roteiro não começa. */
  ativo: boolean;
  aoConcluirEtapa: (etapa: number) => void;
}) {
  const contornoRef = useRef<HTMLDivElement>(null);
  const camadaRef = useRef<HTMLDivElement>(null);
  const paginaRef = useRef<HTMLDivElement>(null);

  // --- tamanho: janela virtual pelo breakpoint real; ajuste pela largura disponível
  const [palco, setPalco] = useState<DimensoesPalco | null>(null);
  const [ajuste, setAjuste] = useState(1);
  const ajusteRef = useRef(1);
  useLayoutEffect(() => {
    const contorno = contornoRef.current;
    if (!contorno) return;
    const medirTudo = () => {
      const dimensoes = dimensoesDoPalco(window.innerWidth);
      setPalco((atual) => (atual?.largura === dimensoes.largura && atual.altura === dimensoes.altura ? atual : dimensoes));
      const novo = Math.min(1, contorno.clientWidth / dimensoes.largura);
      ajusteRef.current = novo;
      setAjuste(novo);
    };
    medirTudo();
    const observador = new ResizeObserver(medirTudo);
    observador.observe(contorno);
    return () => observador.disconnect();
  }, []);

  // --- estado das telas (apenas local)
  const [tela, setTela] = useState<TelaDemonstracao>("home");
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const [destaque, setDestaque] = useState<Retangulo | null>(null);
  const [clique, setClique] = useState(0);
  const [pressionado, setPressionado] = useState(false);
  const [rolado, setRolado] = useState(false);

  const resultado = (dados && resultadoDaBusca(dados.buscas, busca)) ?? { profissionais: [], total: 0 };

  // --- câmera, rolagem e cursor como motion values (sem re-render por quadro)
  const camX = useMotionValue(512);
  const camY = useMotionValue(340);
  const camZ = useMotionValue(1);
  const rolagem = useMotionValue(0);
  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const cursorOpacidade = useMotionValue(0);
  const largura = palco?.largura ?? 1024;
  const altura = palco?.altura ?? 680;
  const camadaX = useTransform<number, number>([camX, camZ], ([x, z]) => largura / 2 - x * z);
  const camadaY = useTransform<number, number>([camY, camZ], ([y, z]) => altura / 2 - y * z);
  const paginaY = useTransform(rolagem, (v) => -v);
  const telaCursorX = useTransform<number, number>([cursorX, camX, camZ], ([c, x, z]) => largura / 2 + (c - x) * z);
  const telaCursorY = useTransform<number, number>([cursorY, camY, camZ], ([c, y, z]) => altura / 2 + (c - y) * z);
  useMotionValueEvent(rolagem, "change", (v) => setRolado(v > 50));

  // --- pausa: congela o que estiver em andamento
  const pausadoRef = useRef(pausado);
  const animacoes = useRef(new Set<ReturnType<typeof animate>>());
  useEffect(() => {
    pausadoRef.current = pausado;
    animacoes.current.forEach((controle) => (pausado ? controle.pause() : controle.play()));
  }, [pausado]);

  const aoConcluirRef = useRef(aoConcluirEtapa);
  useEffect(() => {
    aoConcluirRef.current = aoConcluirEtapa;
  }, [aoConcluirEtapa]);

  // --- o roteiro da etapa atual
  useEffect(() => {
    if (!palco || !ativo || !dados) return;
    const controle = { cancelado: false };
    const emAndamento = animacoes.current;
    const verificar = () => {
      if (controle.cancelado) throw new Cancelado();
    };

    /** Espera que só conta enquanto não está pausado. */
    const esperar = (ms: number) =>
      new Promise<void>((resolver, rejeitar) => {
        let restante = ms;
        let ultimo = performance.now();
        const passo = () => {
          if (controle.cancelado) return rejeitar(new Cancelado());
          const agora = performance.now();
          if (!pausadoRef.current) restante -= agora - ultimo;
          ultimo = agora;
          if (restante <= 0) resolver();
          else window.setTimeout(passo, 30);
        };
        passo();
      });

    const animar = async (valor: MotionValue<number>, para: number, duracao: number, curva: readonly number[] = CURVA) => {
      verificar();
      // Já no destino: o `animate` do Motion não resolve a promessa quando
      // origem e destino coincidem (o roteiro ficava parado aqui no celular).
      if (Math.abs(valor.get() - para) < 0.001) {
        valor.set(para);
        return;
      }
      const animacao = animate(valor, para, { duration: duracao, ease: curva as [number, number, number, number] });
      emAndamento.add(animacao);
      if (pausadoRef.current) animacao.pause();
      try {
        await animacao;
      } finally {
        emAndamento.delete(animacao);
      }
      verificar();
    };

    /** Retângulo de um elemento em coordenadas da janela virtual (já com a rolagem). */
    const medir = (seletor: string): Retangulo | null => {
      const elemento = paginaRef.current?.parentElement?.querySelector(seletor);
      const camada = camadaRef.current;
      if (!elemento || !camada) return null;
      const r = elemento.getBoundingClientRect();
      const base = camada.getBoundingClientRect();
      const escala = ajusteRef.current * camZ.get();
      const x = (r.left - base.left) / escala;
      const y = (r.top - base.top) / escala;
      const l = r.width / escala;
      const a = r.height / escala;
      return { x, y, largura: l, altura: a, cx: x + l / 2, cy: y + a / 2 };
    };
    /**
     * Mede esperando o elemento existir: na troca de tela, a anterior ainda
     * está saindo (250 ms) quando o roteiro pede o alvo da próxima.
     */
    const exigir = async (seletor: string, limiteMs = 2000) => {
      for (let decorrido = 0; decorrido <= limiteMs; decorrido += 60) {
        const r = medir(seletor);
        if (r) return r;
        await esperar(60);
      }
      throw new AlvoAusente(seletor);
    };

    const maxRolagem = () => Math.max(0, (paginaRef.current?.offsetHeight ?? 0) - palco.altura);
    const limitarRolagem = (y: number) => Math.min(maxRolagem(), Math.max(0, y));

    // No celular a janela virtual já é quase 1:1 com a tela: zoom maior cortaria o texto nas laterais.
    // O zoom só destaca clique e digitação; a visão geral é sempre zoom 1.
    const zoomFoco = palco.largura >= 1024 ? 1.7 : palco.largura >= 640 ? 1.4 : 1.25;
    const ehCelular = palco.largura < 1024;

    const focar = (ponto: Ponto, zoom: number, duracao: number) => {
      const alvo = enquadrarCamera(ponto, zoom, palco);
      return Promise.all([animar(camX, alvo.x, duracao), animar(camY, alvo.y, duracao), animar(camZ, alvo.zoom, duracao)]);
    };
    const focarTudo = (duracao: number) => focar(cameraNeutra(palco), 1, duracao);
    const moverCursor = (ponto: Ponto, duracao: number) =>
      Promise.all([animar(cursorX, ponto.x, duracao), animar(cursorY, ponto.y, duracao), animar(cursorOpacidade, 1, 0.3)]);
    const clicar = async () => {
      verificar();
      setPressionado(true);
      setClique((c) => c + 1);
      await esperar(180);
      setPressionado(false);
      await esperar(220);
    };
    /** Próximo quadro já renderizado (troca de tela, digitação). */
    const quadro = () => esperar(90);

    /** Posições instantâneas: o início de cada etapa é sempre o mesmo, venha de onde vier. */
    const posicionarCamera = (ponto: Ponto, zoom: number) => {
      const alvo = enquadrarCamera(ponto, zoom, palco);
      camX.set(alvo.x);
      camY.set(alvo.y);
      camZ.set(alvo.zoom);
    };
    const neutra = cameraNeutra(palco);
    const prepararTela = (proxima: TelaDemonstracao, termo: string) => {
      setTela(proxima);
      setBusca(termo);
      setMenuAberto(false);
      setDestaque(null);
    };
    const pontoDoCampo = (campo: Retangulo): Ponto => ({ x: campo.x + Math.min(campo.largura * 0.3, 150), y: campo.cy });
    /**
     * Visão geral da listagem: o campo de busca logo abaixo do cabeçalho e,
     * embaixo dele, o máximo de cards que a janela comporta.
     */
    const rolarParaVisaoGeral = async (duracao: number) => {
      const campo = await exigir(SELETOR.campoBusca);
      const destino = limitarRolagem(rolagem.get() + campo.y - ALTURA_CABECALHO - 24);
      if (duracao > 0) await animar(rolagem, destino, duracao);
      else rolagem.set(destino);
      await quadro();
      return await exigir(SELETOR.campoBusca);
    };
    /** Só rola se o card clicado não couber inteiro na janela. */
    const garantirCardVisivel = async (duracao: number) => {
      const card = await exigir(SELETOR.cardSelecionado);
      const sobra = card.y + card.altura - (palco.altura - 16);
      if (sobra > 0) {
        await animar(rolagem, limitarRolagem(rolagem.get() + Math.min(sobra, card.y - ALTURA_CABECALHO)), duracao);
        await quadro();
      }
      return await exigir(SELETOR.cardSelecionado);
    };

    /* ------------------------------------------------------------------------
       Movimento reduzido: cada etapa é um quadro parado, com o alvo marcado.
       Sem cursor, sem zoom e sem digitação animada.
       ------------------------------------------------------------------------ */
    const quadroParado = async () => {
      cursorOpacidade.set(0);
      rolagem.set(0);
      posicionarCamera(neutra, 1);
      if (etapa === 0) {
        prepararTela("home", "");
        await quadro();
        setDestaque(await exigir(ehCelular ? SELETOR.menuMobile : SELETOR.linkProfissionais));
      } else if (etapa === 1 || etapa === 2) {
        prepararTela("listagem", etapa === 2 ? TERMO_DEMONSTRACAO : "");
        await quadro();
        setDestaque(await rolarParaVisaoGeral(0));
      } else if (etapa === 3) {
        prepararTela("listagem", TERMO_DEMONSTRACAO);
        await quadro();
        await rolarParaVisaoGeral(0);
        if (dados.selecionadoId) {
          await garantirCardVisivel(0);
          setDestaque(await exigir(SELETOR.verPerfil));
        }
      } else {
        prepararTela("perfil", "");
      }
    };

    /* ------------------------------------------------------------------------
       Roteiros animados. Cada um começa no mesmo estado em que o anterior
       termina — por isso "Próxima" e "Anterior" não dão saltos.
       ------------------------------------------------------------------------ */
    const roteiros: (() => Promise<void>)[] = [
      // 0 · Home → clique em "Profissionais"
      async () => {
        prepararTela("home", "");
        rolagem.set(0);
        posicionarCamera(neutra, 1);
        cursorX.set(palco.largura * 0.72);
        cursorY.set(palco.altura * 0.78);
        cursorOpacidade.set(0);
        await quadro();
        await esperar(700);
        if (!ehCelular) {
          const link = await exigir(SELETOR.linkProfissionais);
          await Promise.all([focar({ x: link.cx, y: link.cy + 40 }, zoomFoco, 1.3), moverCursor({ x: link.cx, y: link.cy }, 1.4)]);
          await esperar(250);
          await clicar();
        } else {
          const botao = await exigir(SELETOR.menuMobile);
          await Promise.all([focar({ x: botao.cx, y: botao.cy + 60 }, zoomFoco, 1.2), moverCursor({ x: botao.cx, y: botao.cy }, 1.3)]);
          await clicar();
          setMenuAberto(true);
          await esperar(600);
          const link = await exigir(SELETOR.linkProfissionaisMobile);
          await Promise.all([focar({ x: link.cx, y: link.cy }, zoomFoco, 0.8), moverCursor({ x: link.x + 70, y: link.cy }, 0.9)]);
          await clicar();
        }
        // A listagem abre e a câmera se afasta para mostrar a página inteira.
        setMenuAberto(false);
        setTela("listagem");
        await quadro();
        await focarTudo(1);
      },

      // 1 · Listagem em visão geral → aproximar a busca e clicar no campo
      async () => {
        prepararTela("listagem", "");
        rolagem.set(0);
        posicionarCamera(neutra, 1);
        await quadro();
        await esperar(1300);
        // Desce até a visão geral: busca no topo e vários cards com foto.
        const campo = await rolarParaVisaoGeral(1.3);
        await esperar(1300);
        const ponto = pontoDoCampo(campo);
        await Promise.all([focar(ponto, zoomFoco, 1.2), moverCursor(ponto, 1.3)]);
        await clicar();
        setDestaque(campo);
        await esperar(400);
      },

      // 2 · Digitação do termo, caractere por caractere, com resultados reais
      async () => {
        // Vindo da etapa 1, tela, rolagem e câmera já estão aqui: nada salta.
        prepararTela("listagem", "");
        await quadro();
        const campo = await rolarParaVisaoGeral(0);
        const ponto = pontoDoCampo(campo);
        posicionarCamera(ponto, zoomFoco);
        cursorX.set(ponto.x);
        cursorY.set(ponto.y);
        cursorOpacidade.set(1);
        await quadro();
        setDestaque(await exigir(SELETOR.campoBusca));
        await esperar(400);
        for (let i = 1; i <= TERMO_DEMONSTRACAO.length; i += 1) {
          setBusca(TERMO_DEMONSTRACAO.slice(0, i));
          await esperar(INTERVALO_DIGITACAO_MS);
        }
        await esperar(800);
        setDestaque(null);
        // Zoom out suave: o campo e todos os resultados juntos.
        await focarTudo(1.4);
        await esperar(700);
      },

      // 3 · Resultados em conjunto → clique em "Ver perfil" do primeiro disponível
      async () => {
        prepararTela("listagem", TERMO_DEMONSTRACAO);
        posicionarCamera(neutra, 1);
        await quadro();
        await rolarParaVisaoGeral(0);
        cursorOpacidade.set(1);
        // Tempo para ver os resultados juntos, sem zoom.
        await esperar(1600);
        // Sem resultado público para o termo, não há o que abrir: a etapa
        // termina mostrando a lista real (vazia), sem inventar um card.
        if (!dados.selecionadoId) return;
        const card = await garantirCardVisivel(0.9);
        const botao = await exigir(SELETOR.verPerfil);
        await moverCursor({ x: botao.cx, y: botao.cy }, 1.3);
        // Zoom leve só para destacar o clique, com o card inteiro à vista.
        const zoomClique = Math.max(1, Math.min(1.35, (palco.altura * 0.9) / card.altura, (palco.largura * 0.95) / card.largura));
        await focar({ x: card.cx, y: card.cy }, zoomClique, 0.8);
        await esperar(250);
        await clicar();
        setDestaque(null);
        setTela("perfil");
        rolagem.set(0);
        await quadro();
        await focarTudo(0.8);
      },

      // 4 · Perfil real em visão ampla → rolagem contínua até o fim
      async () => {
        if (!dados.perfil) return;
        prepararTela("perfil", "");
        rolagem.set(0);
        posicionarCamera(neutra, 1);
        // O cursor sai de cena: aqui o que importa é ler o perfil.
        await animar(cursorOpacidade, 0, 0.5);
        // O perfil real mostra o esqueleto por 600 ms; depois, um tempo para o topo.
        await esperar(2200);
        const distancia = maxRolagem();
        const duracao = Math.min(PERCURSO_MAXIMO_S, Math.max(PERCURSO_MINIMO_S, distancia / (ehCelular ? VELOCIDADE_PERFIL.celular : VELOCIDADE_PERFIL.desktop)));
        await animar(rolagem, distancia, duracao, CURVA_PERCURSO);
        await esperar(1200);
      },
    ];

    (async () => {
      try {
        if (reduzir) await quadroParado();
        else await roteiros[etapa]?.();
        if (!controle.cancelado) aoConcluirRef.current(etapa);
      } catch (erro) {
        if (erro instanceof AlvoAusente) {
          console.warn("[demonstracao-busca] alvo não encontrado:", erro.message);
          if (!controle.cancelado) aoConcluirRef.current(etapa);
        } else if (!(erro instanceof Cancelado)) console.error("[demonstracao-busca] falha no roteiro", erro);
      }
    })();

    return () => {
      controle.cancelado = true;
      emAndamento.forEach((animacao) => animacao.stop());
      emAndamento.clear();
      setPressionado(false);
    };
  }, [etapa, rodada, reduzir, ativo, palco, dados, camX, camY, camZ, rolagem, cursorX, cursorY, cursorOpacidade]);

  return (
    <div ref={contornoRef} className="w-full">
      {palco && (
        <div className="relative mx-auto" style={{ width: palco.largura * ajuste, height: palco.altura * ajuste }}>
          {/* Janela virtual: inerte e escondida de leitores de tela — o texto da etapa descreve a cena. */}
          <div
            inert
            aria-hidden="true"
            className="absolute left-0 top-0 origin-top-left overflow-hidden bg-background"
            style={{ width: palco.largura, height: palco.altura, transform: `scale(${ajuste})` }}
          >
            <motion.div
              ref={camadaRef}
              className="absolute left-0 top-0 isolate"
              style={{ width: palco.largura, height: palco.altura, x: camadaX, y: camadaY, scale: camZ, originX: 0, originY: 0 }}
            >
              <div className="absolute inset-0 overflow-hidden">
                <motion.div ref={paginaRef} className="relative isolate bg-background" style={{ y: paginaY }}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={tela}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduzir ? 0 : 0.25 }}
                    >
                      {tela === "home" ? (
                        <TelaHomeDemonstracao alturaMinima={palco.altura} />
                      ) : tela === "listagem" ? (
                        <TelaListagemDemonstracao
                          busca={busca}
                          profissionais={resultado.profissionais}
                          total={resultado.total}
                          selecionadoId={dados?.selecionadoId ?? null}
                        />
                      ) : dados?.perfil ? (
                        <TelaPerfilDemonstracao perfil={dados.perfil} />
                      ) : (
                        // Honesto: sem profissional público para o termo, não há perfil a abrir.
                        <div className="grid place-items-center px-6 pt-40 text-center text-muted-foreground" style={{ minHeight: palco.altura }}>
                          Nenhum perfil público encontrado para “{TERMO_DEMONSTRACAO}”.
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
                <CabecalhoEspelho rolado={rolado} menuAberto={menuAberto} ativo={tela === "home" ? "Início" : "Profissionais"} />
              </div>

              {/* Marca o alvo da etapa (campo, link, botão). Fixo com movimento reduzido. */}
              {destaque && (
                <motion.div
                  className="pointer-events-none absolute z-[60] rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
                  style={{ left: destaque.x - 2, top: destaque.y - 2, width: destaque.largura + 4, height: destaque.altura + 4 }}
                  initial={{ opacity: 0 }}
                  animate={reduzir ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
                  transition={reduzir ? { duration: 0 } : { duration: 1.6, repeat: Infinity }}
                />
              )}
            </motion.div>

            {/* Cursor: fora da câmera, com tamanho constante. */}
            {!reduzir && (
              <motion.div
                className="pointer-events-none absolute left-0 top-0 z-[70]"
                style={{ x: telaCursorX, y: telaCursorY, opacity: cursorOpacidade }}
              >
                <AnimatePresence>
                  {clique > 0 && (
                    <motion.span
                      key={clique}
                      className="absolute -left-6 -top-6 size-12 rounded-full border-2 border-primary bg-primary/25"
                      initial={{ scale: 0.3, opacity: 0.9 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  )}
                </AnimatePresence>
                <motion.span className="-ml-1 -mt-1 block origin-top-left" animate={{ scale: pressionado ? 0.82 : 1 }} transition={{ duration: 0.12 }}>
                  <MousePointer2 className="size-10 fill-foreground stroke-background drop-shadow-lg" strokeWidth={1.25} />
                </motion.span>
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
