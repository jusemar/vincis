"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useInView } from "framer-motion";

// O snapshot de servidor impede divergência de HTML na hidratação com movimento reduzido.
const consultarMovimento = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const movimentoNoServidor = () => false;
function observarMovimento(notificar: () => void) {
  const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
  consulta.addEventListener("change", notificar);
  return () => consulta.removeEventListener("change", notificar);
}

export function useDemonstracao() {
  const ref = useRef<HTMLElement>(null);
  const visivel = useInView(ref, { amount: 0.15 });
  const movimentoReduzido = useSyncExternalStore(
    observarMovimento,
    consultarMovimento,
    movimentoNoServidor,
  );
  const [tempo, setTempo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [abaVisivel, setAbaVisivel] = useState(true);
  useEffect(() => {
    const atualizar = () => setAbaVisivel(!document.hidden);
    document.addEventListener("visibilitychange", atualizar);
    return () => document.removeEventListener("visibilitychange", atualizar);
  }, []);
  // Um único relógio para toda a cena. Fora da tela/aba não há trabalho contínuo.
  const executando = visivel && abaVisivel && !pausado && !movimentoReduzido;
  useEffect(() => {
    if (!executando) return;
    const id = window.setInterval(() => setTempo((atual) => atual + 100), 100);
    return () => window.clearInterval(id);
  }, [executando]);
  return {
    ref,
    tempo,
    setTempo,
    pausado,
    setPausado,
    movimentoReduzido: !!movimentoReduzido,
    executando,
  };
}
