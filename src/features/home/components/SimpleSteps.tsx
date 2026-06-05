import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, Settings, BarChart3 } from 'lucide-react'

interface StepData {
  id: number
  icon: React.ElementType
  title: string
  description: string
  image: string
}

const steps: StepData[] = [
  {
    id: 0,
    icon: LayoutDashboard,
    title: 'Dashboard Inteligente',
    description: 'Visão completa do seu portfólio com métricas em tempo real e análise preditiva.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBajid22LRHAdHeQkAciZajA2lbdIVWZo6TeIHtV84Olltt3PagyZf2FZKt7aKmHvWYZS3jYX-l7HDtj4iL8bOOYlCJC-qreVE1WpSvAVxbysI7LSPGh9rdIif6W--BKU7RRwS9wIn-bPGiPoIqGAJhZslCa89YCwYMqog11cadnYf7JiEPR4gKL48iKDnTxgOwNqSW6r0ouf9hud4Sqz3wJZTsIMzWuSheGvArnhmuSdxawJHuMxJ30WxYbuHnKqXTu_wnIsreTFM',
  },
  {
    id: 1,
    icon: Settings,
    title: 'Operações Simplificadas',
    description: 'Gerencie manutenções, contratos e tarefas da sua equipe com máxima eficiência.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHkdAVFCKOLRbDPsU6DxUK8tKe4nZeLMA8dgK3rKKHu6yqTsWpjlxvzUVtR7b5x_Egmo7eV-32TRwBz4tnb3SfobuzECWq3wlsSo63-oZFpATEM3Lmr_Xt940JXFD685La8Mvh3mFx8x8Kxh0ZsTMwxBaYnw2Dneri1gdtaVLwnFjsChfxB6yDbFotFZ3Vuc7CEO5yuT14L5dEyp5NPTHogaA9CUxFhjUjk-fCfxhYHJrq8_JZzw01_zmHjdIybnSairisEdHf49o',
  },
  {
    id: 2,
    icon: BarChart3,
    title: 'Análise Financeira',
    description: 'Relatórios detalhados de ROI, fluxo de caixa e performance por unidade.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAJ_nK-CIs41ton6riak05ZakGJo4K-iMJLfhcSZiCcn683yMhnLIf2ScBaRE4_SOjVH2RkAWplaWzCbTHL31RoFUWOo2nTUcNZ8JPDpbpP4fRz2UFgbBFHY-r8c-c-nrV3o3e_JlslnD-1HimLvflz2M8lo3rrdDljiBRjibNnv293pTTru3ZPBgeakI0u97NhLM5g5Fgse8oRzo1MpOuONzlrY1CNII_qq9cp2lZ7NHJtzUEcGqcWdYxOrZIgqlwPxxCgXAuMLG8',
  },
]

export default function SimpleSteps() {
  const [activeTab, setActiveTab] = useState(0)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.innerWidth < 1024 && tabsRef.current) {
      const activeBtn = tabsRef.current.querySelector(`[data-tab="${activeTab}"]`)
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [activeTab])

  return (
    <section className="w-full bg-background py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center max-w-4xl mx-auto mb-20 space-y-6">
          <h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-tight">
            Simples assim, em{' '}
            <span className="text-gradient-gold">3 passos</span>
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Do problema ao especialista certo — rápido, seguro e sem burocracia.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div
            ref={tabsRef}
            className="lg:col-span-4 flex lg:flex-col overflow-x-auto lg:overflow-visible gap-2 lg:gap-3 pb-4 lg:pb-0 hide-scrollbar"
          >
            {steps.map((step) => {
              const Icon = step.icon
              const isActive = activeTab === step.id
              return (
                <button
                  key={step.id}
                  data-tab={step.id}
                  onClick={() => setActiveTab(step.id)}
                  className={`flex-shrink-0 lg:w-full text-left p-5 rounded-xl transition-all duration-300 group min-w-[260px] lg:min-w-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-primary/10 to-primary/5 border-l-4 border-primary lg:border-l-4 lg:border-b-0 border-b-4'
                      : 'hover:bg-muted/30 border-l-4 border-transparent'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-6 h-6 transition-colors ${
                          isActive
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-primary'
                        }`}
                      />
                      <h3
                        className={`font-semibold text-base transition-colors ${
                          isActive
                            ? 'text-foreground'
                            : 'text-foreground group-hover:text-primary'
                        }`}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p
                      className={`text-sm leading-relaxed hidden lg:block transition-colors ${
                        isActive ? 'text-muted-foreground' : 'text-muted-foreground/70'
                      }`}
                    >
                      {step.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="lg:col-span-8 relative aspect-[16/10] bg-card rounded-2xl overflow-hidden shadow-card border border-border/50 group">
            <AnimatePresence mode="wait">
              <motion.img
                key={activeTab}
                src={steps[activeTab].image}
                alt={steps[activeTab].title}
                className="absolute inset-0 w-full h-full object-cover"
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              />
            </AnimatePresence>

            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/30 via-transparent to-transparent" />

            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full group-hover:bg-primary/20 transition-all duration-700" />
          </div>
        </div>
      </div>
    </section>
  )
}
