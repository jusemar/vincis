"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import passo1 from "@/assets/passo1.webp";
import passo2 from "@/assets/passo2.webp";
import passo3 from "@/assets/passo3.webp";

interface StepData {
  id: number;
  title: string;
  description: string;
  image: { src: string; height: number; width: number };
}

const steps: StepData[] = [
  {
    id: 1,
    title: "Escolha o especialista",
    description:
      "Selecione o profissional ideal para sua necessidade. Filtre por localização, avaliações, especialidades e preço.",
    image: passo1,
  },
  {
    id: 2,
    title: "O que você precisa?",
    description:
      "Diga o que precisa e receba um orçamento individual ou de múltiplos profissionais.",
    image: passo2,
  },
  {
    id: 3,
    title: "Agende a consulta",
    description:
      "Agende uma consultoria com o profissional escolhido no horário que for melhor para você.",
    image: passo3,
  },
];

export default function SimpleSteps() {
  const [activeTab, setActiveTab] = useState(1);
  const autoPlayRef = useRef(true);
  const activeStep = steps.find((s) => s.id === activeTab)!;

  useEffect(() => {
    if (!autoPlayRef.current) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev === 3 ? 1 : prev + 1));
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative py-12 sm:py-16 md:py-24 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Como Funciona
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Resolva em{" "}
            <span className="text-gradient-gold">3 passos simples</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
            Da escolha do profissional ao agendamento, tudo online e sem
            burocracia.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Image */}
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-elevated bg-card">
              <img
                src={activeStep.image.src}
                alt={activeStep.title}
                className="w-full h-auto object-cover"
              />
            </div>
          </motion.div>

          {/* Steps */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <motion.button
                key={step.id}
                onClick={() => {
                  autoPlayRef.current = false;
                  setActiveTab(step.id);
                }}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.5 }}
                className={`w-full text-left p-4 sm:p-5 rounded-xl transition-all duration-300 ${
                  activeTab === step.id
                    ? "bg-primary/10 border border-primary/20 shadow-glow"
                    : "bg-card/50 border border-border/50 hover:bg-card hover:border-primary/10"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                      activeTab === step.id
                        ? "bg-primary text-primary-foreground shadow-glow"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.id}
                  </span>
                  <div className="min-w-0">
                    <h3
                      className={`text-base sm:text-lg font-bold mb-1 transition-colors ${
                        activeTab === step.id
                          ? "text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
