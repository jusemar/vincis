import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import passo1 from '@/assets/passo1.webp'
import passo2 from '@/assets/passo2.webp'
import passo3 from '@/assets/passo3.webp'

interface StepData {
  id: number
  title: string
  description: string
  image: string
}

const steps: StepData[] = [
  {
    id: 1,
    title: 'Escolha o especialista',
    description:
      'Selecione o profissional ideal para sua necessidade. Filtre por localização, avaliações, especialidades e preço.',
    image: passo1,
  },
  {
    id: 2,
    title: 'O que você precisa?',
    description:
      'Diga o que precisa e receba um orçamento individual ou de múltiplos profissionais.',
    image: passo2,
  },
  {
    id: 3,
    title: 'Agende a consulta',
    description:
      'Agende uma consultoria com o profissional escolhido no horário que for melhor para você.',
    image: passo3,
  },
]

export default function SimpleSteps() {
  const [activeTab, setActiveTab] = useState(1)
  const autoPlayRef = useRef(true)
  const activeStep = steps.find((s) => s.id === activeTab)!

  useEffect(() => {
    if (!autoPlayRef.current) return
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev === 3 ? 1 : prev + 1))
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  const handleTabClick = (id: number) => {
    autoPlayRef.current = false
    setActiveTab(id)
  }

  return (
    <section className="w-full bg-background px-4 py-20">
      <div className="mx-auto max-w-[1080px]">
        <header className="mb-8 text-center lg:mb-16">
          <h2 className="text-[clamp(30px,4.5vw,48px)] font-extrabold leading-[1.12] text-foreground">
            Simples assim,{' '}
            <em className="not-italic text-primary">em 3 passos</em>
          </h2>
          <p className="mx-auto mt-[14px] max-w-[600px] text-base leading-relaxed text-muted-foreground">
            Do problema ao especialista certo — rápido, seguro e sem burocracia.
          </p>
        </header>

        <div className="flex flex-col-reverse items-center gap-11 lg:grid lg:grid-cols-[320px_1fr]">
          <div className="flex w-full flex-col gap-1">
            {steps.map((step) => {
              const isActive = activeTab === step.id
              return (
                <button
                  key={step.id}
                  onClick={() => handleTabClick(step.id)}
                  className={`w-full rounded-[14px] p-4 text-left transition-all duration-200 ${
                    isActive
                      ? 'border border-[rgba(220,210,195,0.7)] bg-card shadow-[0_2px_16px_rgba(0,0,0,0.055)]'
                      : 'border border-transparent bg-transparent hover:border-[rgba(230,220,205,0.6)] hover:bg-white/70'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200 ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-[#EDEBE8] text-[#999]'
                      }`}
                    >
                      {step.id}
                    </span>
                    <span
                      className={`text-[15px] font-bold leading-tight transition-colors ${
                        isActive ? 'text-foreground' : 'text-[#444]'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  <p
                    className={`pl-10 text-[13.5px] leading-relaxed transition-colors max-lg:hidden ${
                      isActive ? 'text-muted-foreground' : 'text-[#999]'
                    }`}
                  >
                    {step.description}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="relative w-full">
            <div className="absolute -bottom-[18px] left-[6%] right-[6%] z-0 h-[60px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(180,160,120,0.22)_0%,transparent_70%)] blur-[10px]" />

            <div className="relative z-10 overflow-hidden rounded-[20px] border border-[rgba(220,215,205,0.55)] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.06),0_16px_48px_rgba(0,0,0,0.07)]">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeTab}
                  src={activeStep.image}
                  alt={activeStep.title}
                  className="h-[320px] w-full object-cover object-top lg:h-[540px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeInOut' }}
                />
              </AnimatePresence>

              <div className="pointer-events-none absolute inset-0 rounded-[19px] bg-[linear-gradient(to_bottom,rgba(247,245,242,0.18)_0%,transparent_14%,transparent_80%,rgba(247,245,242,0.28)_100%)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
