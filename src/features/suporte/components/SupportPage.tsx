import { useState, useMemo } from 'react'
import { ChevronRight, HelpCircle } from 'lucide-react'
import Footer from '@/components/shared/Footer'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface FAQ {
  question: string
  answer: string
}

interface Category {
  name: string
  faqs: FAQ[]
}

const categories: Category[] = [
  {
    name: 'Plataforma',
    faqs: [
      {
        question: 'O que é a Vincis?',
        answer: 'A Vincis é uma plataforma que conecta clientes a profissionais jurídicos e contábeis qualificados, oferecendo diversos modelos de contratação para atender às necessidades de cada empresa.',
      },
      {
        question: 'Como funciona a plataforma?',
        answer: 'Você escolhe o modelo de serviço ideal (consultoria mensal, avulsa, solicitação aberta ou plano completo), é conectado a profissionais especializados e acompanha tudo de forma transparente pela plataforma.',
      },
      {
        question: 'A plataforma é segura?',
        answer: 'Sim! Utilizamos criptografia de ponta a ponta, servidores seguros e seguimos as melhores práticas de segurança da informação e conformidade com a LGPD.',
      },
      {
        question: 'Posso usar a plataforma pelo celular?',
        answer: 'Sim, nossa plataforma é totalmente responsiva e pode ser acessada de qualquer dispositivo — computador, tablet ou smartphone.',
      },
    ],
  },
  {
    name: 'Planos',
    faqs: [
      {
        question: 'Quais são os modelos de serviço disponíveis?',
        answer: 'Oferecemos quatro modelos: Consultoria Mensal (acompanhamento contínuo), Consultoria Avulsa (por demanda), Solicitação Aberta (receba propostas de profissionais) e Plano Completo (jurídico + contábil integrado).',
      },
      {
        question: 'Posso trocar de plano a qualquer momento?',
        answer: 'Sim, você pode fazer upgrade ou downgrade do seu plano a qualquer momento. As mudanças são aplicadas no próximo ciclo de faturamento.',
      },
      {
        question: 'Existe fidelidade ou contrato mínimo?',
        answer: 'Não exigimos fidelidade. Nos planos mensais, você pode cancelar a qualquer momento sem multas ou taxas adicionais.',
      },
      {
        question: 'Como funciona a consultoria avulsa?',
        answer: 'Na consultoria avulsa, você contrata um profissional para uma demanda específica, pagando apenas pelo serviço realizado, sem compromisso mensal.',
      },
    ],
  },
  {
    name: 'Profissionais',
    faqs: [
      {
        question: 'Como os profissionais são selecionados?',
        answer: 'Todos os profissionais passam por um rigoroso processo de verificação que inclui análise de credenciais, experiência, registro nos órgãos competentes (OAB/CRC) e avaliações de clientes anteriores.',
      },
      {
        question: 'Posso escolher o profissional que vai me atender?',
        answer: 'Sim! Você pode navegar pelos perfis dos profissionais, ver suas especializações, avaliações e escolher o que melhor atende às suas necessidades.',
      },
      {
        question: 'E se eu não gostar do profissional?',
        answer: 'Você pode solicitar a troca de profissional a qualquer momento, sem custos adicionais. Nosso objetivo é garantir sua total satisfação.',
      },
    ],
  },
  {
    name: 'Pagamentos',
    faqs: [
      {
        question: 'Quais formas de pagamento são aceitas?',
        answer: 'Aceitamos cartão de crédito, débito, PIX e boleto bancário. Para planos mensais, o pagamento é recorrente e automático.',
      },
      {
        question: 'Como funciona o faturamento?',
        answer: 'Nos planos mensais, a cobrança é feita no mesmo dia de cada mês. Para serviços avulsos, o pagamento é realizado após a conclusão do serviço.',
      },
      {
        question: 'Posso solicitar reembolso?',
        answer: 'Sim, em caso de insatisfação com o serviço, você pode solicitar reembolso em até 7 dias após a prestação, sujeito à análise da nossa equipe.',
      },
    ],
  },
  {
    name: 'Conta',
    faqs: [
      {
        question: 'Como crio minha conta?',
        answer: 'Basta clicar em "Criar Conta", preencher seus dados e escolher o modelo de serviço. Em poucos minutos você já estará conectado a profissionais qualificados.',
      },
      {
        question: 'Esqueci minha senha, o que faço?',
        answer: 'Na tela de login, clique em "Esqueci minha senha". Enviaremos um e-mail com instruções para redefinir sua senha de forma segura.',
      },
      {
        question: 'Como excluo minha conta?',
        answer: 'Você pode solicitar a exclusão da sua conta nas configurações do perfil ou entrando em contato com nosso suporte. Seus dados serão removidos conforme a LGPD.',
      },
    ],
  },
]

const SupportPage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFAQ, setSelectedFAQ] = useState<FAQ | null>(null)

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories
    const query = searchQuery.toLowerCase()
    return categories
      .map((cat) => ({
        ...cat,
        faqs: cat.faqs.filter(
          (faq) =>
            faq.question.toLowerCase().includes(query) ||
            faq.answer.toLowerCase().includes(query),
        ),
      }))
      .filter((cat) => cat.faqs.length > 0)
  }, [searchQuery])

  return (
    <div className="min-h-dvh bg-background">
      {/* Content */}
      <section className="pt-32 pb-24">
        <div className="max-w-6xl mx-auto px-gutter">
          <div className="grid md:grid-cols-5 gap-8">
            {/* Left — Categories as accordions with questions inside */}
            <div className="md:col-span-2">
              {filteredCategories.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground/70 text-lg">
                    Nenhum resultado encontrado.
                  </p>
                  <p className="text-muted-foreground/50 text-sm mt-2">
                    Tente usar outras palavras-chave.
                  </p>
                </div>
              ) : (
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={filteredCategories[0]?.name}
                  className="space-y-3"
                >
                  {filteredCategories.map((cat) => (
                    <AccordionItem
                      key={cat.name}
                      value={cat.name}
                      className="border border-border rounded-xl overflow-hidden data-[state=open]:border-primary/30 transition-colors duration-300"
                    >
                      <AccordionTrigger className="px-5 py-4 text-base font-semibold hover:no-underline hover:text-primary">
                        {cat.name}
                      </AccordionTrigger>
                      <AccordionContent className="px-2 pb-3">
                        <ul className="space-y-1">
                          {cat.faqs.map((faq, idx) => (
                            <li key={idx}>
                              <button
                                onClick={() => setSelectedFAQ(faq)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all duration-200 ${
                                  selectedFAQ?.question === faq.question
                                    ? 'bg-primary/10 text-primary font-semibold'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                              >
                                {faq.question}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>

            {/* Right — Answer Panel (desktop) */}
            <div className="hidden md:block md:col-span-3">
              <div className="sticky top-28 bg-card border border-border rounded-2xl p-8 min-h-[300px] transition-all duration-300">
                {selectedFAQ ? (
                  <div key={selectedFAQ.question} className="animate-fade-in">
                    <div className="flex items-start gap-3 mb-6">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ChevronRight className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedFAQ.question}
                      </h3>
                    </div>
                    <p className="text-muted-foreground leading-relaxed text-base pl-11">
                      {selectedFAQ.answer}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <HelpCircle className="h-7 w-7 text-primary/50" />
                    </div>
                    <p className="text-muted-foreground/60 font-medium">
                      Selecione uma pergunta ao lado
                    </p>
                    <p className="text-muted-foreground/40 text-sm mt-1">
                      A resposta aparecerá aqui
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile — show answer below question when selected */}
            {selectedFAQ && (
              <div className="md:hidden col-span-full bg-card border border-primary/20 rounded-2xl p-6 animate-fade-in">
                <h3 className="text-base font-semibold text-foreground mb-3">
                  {selectedFAQ.question}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {selectedFAQ.answer}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}

export default SupportPage
