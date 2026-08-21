'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Target } from 'lucide-react'

/**
 * O banner do topo do Dashboard, no estado "existem oportunidades".
 *
 * É **o mesmo banner** da meta mensal, não um segundo: empilhar dois blocos de
 * destaque faria os dois deixarem de ser destaque. Quando o prestador tem
 * oportunidades esperando ação, o banner troca de assunto; quando não tem, ele
 * volta a falar da meta.
 *
 * A estrutura é idêntica à do estado dourado — ícone em quadrado, frase
 * principal, frase de apoio, botão à direita, mesma borda e mesmo brilho suave.
 * Só a família cromática muda, para o verde que o projeto já usa (emerald) nos
 * avisos positivos. Nenhuma paleta nova foi criada.
 */
export function BannerOportunidades({ pendentes }: { pendentes: number }) {
  const singular = pendentes === 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="bg-gradient-to-r from-emerald-500/20 via-emerald-500/15 to-emerald-500/20 rounded-xl p-5 border border-emerald-500/30"
      style={{ boxShadow: '0 0 30px rgba(34, 197, 94, 0.15)' }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-glow">
            <Target className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg">
              {singular ? (
                <>Você tem uma nova oportunidade de serviço disponível.</>
              ) : (
                <>
                  Você tem{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {pendentes}
                  </span>{' '}
                  novas oportunidades de serviço disponíveis.
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {singular
                ? 'Um Cliente está procurando um profissional da sua área. Analise a solicitação e envie sua proposta.'
                : 'Clientes estão procurando profissionais da sua área. Analise as solicitações e envie suas propostas.'}
            </p>
          </div>
        </div>
        <Link href="/admin?pagina=oportunidades">
          <motion.span
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold shadow-glow hover:bg-emerald-500 transition-all"
          >
            {singular ? 'Ver Oportunidade' : 'Ver Oportunidades'}
          </motion.span>
        </Link>
      </div>
    </motion.div>
  )
}
