'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

/**
 * O espaço de destaque do topo do Dashboard, no estado verde.
 *
 * É **um** espaço, não uma pilha: dois blocos de destaque empilhados deixam de
 * ser destaque. Quem decide o assunto é o Dashboard, por prioridade — convite
 * novo, depois oportunidade, depois a meta dourada.
 *
 * Nasceu de dentro de `BannerOportunidades`, quando os convites passaram a
 * disputar o mesmo lugar. É extração, e não desenho novo: a estrutura, o verde,
 * a borda, o brilho, a tipografia, o espaçamento e o botão são exatamente os
 * que já estavam no ar. Assim os dois assuntos não podem divergir visualmente
 * com o tempo, que é o defeito que um segundo componente traria.
 */
export function BannerDestaque({
  icone: Icone,
  titulo,
  descricao,
  rotuloAcao,
  href,
}: {
  icone: LucideIcon
  /** Frase principal. Aceita nó para o número em destaque dentro do texto. */
  titulo: ReactNode
  descricao: string
  rotuloAcao: string
  /** Para onde o botão leva. A tela de chegada continua autorizando o acesso. */
  href: string
}) {
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
            <Icone className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg">{titulo}</p>
            <p className="text-sm text-muted-foreground">{descricao}</p>
          </div>
        </div>
        <Link href={href}>
          <motion.span
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold shadow-glow hover:bg-emerald-500 transition-all"
          >
            {rotuloAcao}
          </motion.span>
        </Link>
      </div>
    </motion.div>
  )
}
