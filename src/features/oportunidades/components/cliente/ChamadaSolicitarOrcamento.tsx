'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { FormularioSolicitarOrcamento } from './FormularioSolicitarOrcamento'

/**
 * Convite para solicitar orçamento, na vitrine pública.
 *
 * Fica junto da busca porque é ali que a dúvida aparece: a pessoa percorre os
 * cards e não sabe qual escolher. O formulário abre **dentro do próprio
 * bloco**, expandindo para baixo — não é modal e não é outra página: a lista de
 * profissionais continua logo abaixo, no lugar de sempre, e recolher devolve a
 * página ao estado anterior.
 *
 * O bloco usa o mesmo vocabulário visual da página — `glass-card`,
 * `bg-gradient-gold`, `btn-shine`, `shadow-glow` — e a animação é a do design
 * system (`accordion-down`/`accordion-up`), sem cor, componente ou espaçamento
 * novo.
 */
export function ChamadaSolicitarOrcamento() {
  const [aberto, setAberto] = useState(false)

  return (
    <Collapsible
      open={aberto}
      onOpenChange={setAberto}
      // `asChild` não cabe aqui: o bloco inteiro é o cartão, e o gatilho é só o
      // botão dentro dele.
      className="mb-6"
    >
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card rounded-2xl border border-primary/20 p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-gold shadow-glow">
              <Sparkles className="size-5 text-on-gradient" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                Precisa de ajuda para encontrar o especialista certo?
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Descreva e receba propostas de vários profissionais da categoria
                adequada.
              </p>
            </div>
          </div>
          {/*
            O mesmo botão abre e recolhe. Aberto, ele diz "Recolher" e o chevron
            aponta para cima — sem isso a área ficava sem saída visível, que foi
            o que o teste manual apontou. O "Fechar" do rodapé do formulário faz
            a mesma coisa, para quem chega ao fim dele.
          */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-label={
                aberto
                  ? 'Recolher formulário de solicitação'
                  : 'Abrir formulário de solicitação'
              }
              className="btn-shine flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-gold px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:shadow-glow-lg"
            >
              {aberto ? 'Recolher' : 'Solicitar orçamento'}
              {aberto ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <FormularioSolicitarOrcamento onCancelar={() => setAberto(false)} />
        </CollapsibleContent>
      </motion.section>
    </Collapsible>
  )
}
