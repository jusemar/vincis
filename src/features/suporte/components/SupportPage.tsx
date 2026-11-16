import { useState, useMemo } from 'react'
import { ChevronRight, HelpCircle } from 'lucide-react'
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

/**
 * Perguntas frequentes.
 *
 * As respostas descrevem o que a plataforma faz hoje — pagamento por Pix pela
 * Efí nos serviços elegíveis, mensalidade paga mês a mês, nenhum estorno
 * automático. Antes havia promessas que o sistema não cumpria (cartão, boleto,
 * cobrança recorrente automática, reembolso em 7 dias, "criptografia de ponta a
 * ponta", conformidade com a LGPD declarada sem verificação); saíram.
 */
const categories: Category[] = [
  {
    name: 'Plataforma',
    faqs: [
      {
        question: 'O que é a Vincis?',
        answer: 'A Vincis é uma plataforma digital que conecta clientes a profissionais independentes das áreas contábil e jurídica. Você encontra profissionais, conhece os serviços disponíveis, solicita orçamentos, contrata e acompanha seus atendimentos. A execução e a responsabilidade técnica pelo serviço cabem ao profissional contratado.',
      },
      {
        question: 'Como funciona a plataforma?',
        answer: 'Você pode buscar um profissional e contratar um serviço do perfil dele, agendar uma consulta, contratar um plano contábil ou descrever sua necessidade em "Solicitar orçamento" para receber propostas. Depois da contratação, o atendimento é acompanhado pela própria plataforma, com mensagens e envio de documentos.',
      },
      {
        question: 'A plataforma é segura?',
        answer: 'O acesso à Vincis é feito por conexão segura (HTTPS), cada usuário vê apenas o que lhe diz respeito e as senhas não são guardadas em texto. Os pagamentos por Pix são processados pela Efí e confirmados junto a ela antes de qualquer liberação. Veja os detalhes na Política de Privacidade.',
      },
      {
        question: 'Posso usar a plataforma pelo celular?',
        answer: 'Sim. A Vincis funciona no navegador do computador, do tablet e do celular.',
      },
    ],
  },
  {
    name: 'Planos',
    faqs: [
      {
        question: 'Quais são as formas de contratação?',
        answer: 'Serviços avulsos do perfil do profissional, consultas agendadas, orçamentos sob medida (você descreve a necessidade e recebe propostas) e planos contábeis com acompanhamento mensal. Os planos disponíveis e seus valores estão em Planos e Preços.',
      },
      {
        question: 'Posso cancelar um plano?',
        answer: 'Sim. O cliente pode cancelar o próprio plano pela plataforma. Valores já pagos e eventuais devoluções são tratados conforme as condições da contratação e a legislação aplicável; fale com a Vincis se precisar.',
      },
      {
        question: 'Posso trocar de plano?',
        answer: 'Para mudar de plano, fale com a Vincis pelos canais de contato e informe o que precisa.',
      },
      {
        question: 'Como funciona um serviço avulso?',
        answer: 'Você contrata um profissional para uma demanda específica, sem compromisso mensal. As condições — valor, escopo e forma de pagamento — aparecem antes da contratação.',
      },
    ],
  },
  {
    name: 'Profissionais',
    faqs: [
      {
        question: 'Como os profissionais entram na Vincis?',
        answer: 'O profissional cria a conta, preenche o perfil — com área de atuação, formação e registro profissional, como CRC ou OAB — e o cadastro passa por análise da Vincis antes de ser publicado. Cada profissional é responsável pela veracidade das informações e pela regularidade da sua habilitação.',
      },
      {
        question: 'Posso escolher o profissional que vai me atender?',
        answer: 'Sim. Você pode navegar pelos perfis, ver áreas de atuação, serviços e avaliações e escolher quem melhor atende à sua necessidade.',
      },
      {
        question: 'E se eu tiver um problema com o atendimento?',
        answer: 'Converse primeiro com o profissional pela plataforma. Se não resolver, fale com a Vincis pelos canais de contato para que a situação seja analisada.',
      },
    ],
  },
  {
    name: 'Pagamentos',
    faqs: [
      {
        question: 'Quais formas de pagamento são aceitas?',
        answer: 'Nos serviços pagos pela Vincis, o pagamento é feito por Pix, processado pela Efí. Alguns serviços — como honorários advocatícios e contratos firmados diretamente com o profissional — são pagos diretamente ao profissional, conforme a modalidade apresentada antes da contratação.',
      },
      {
        question: 'Como funciona a cobrança dos planos?',
        answer: 'Planos mensais são pagos mês a mês, por um novo Pix a cada mensalidade; não há débito automático. Planos semestrais e anuais são pagos de uma vez, também por Pix.',
      },
      {
        question: 'Posso solicitar reembolso?',
        answer: 'Pedidos de reembolso são analisados conforme as condições da contratação e a legislação aplicável — não há estorno automático. Nos serviços pagos pela Vincis, faça a solicitação pelos canais de contato.',
      },
    ],
  },
  {
    name: 'Conta',
    faqs: [
      {
        question: 'Como crio minha conta?',
        answer: 'Clique em "Criar Conta", preencha seus dados e confirme a conta pelo link enviado ao seu e-mail.',
      },
      {
        question: 'Esqueci minha senha, o que faço?',
        answer: 'Na tela de login, clique em "Esqueci minha senha". Enviaremos um e-mail com um link para redefinir sua senha.',
      },
      {
        question: 'Como excluo minha conta?',
        answer: 'Solicite a exclusão pelos canais de contato da Vincis. Alguns dados podem ser mantidos pelo tempo exigido por lei, conforme a Política de Privacidade.',
      },
    ],
  },
]

const SupportPage = () => {
  const [searchQuery] = useState('')
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
    </div>
  )
}

export default SupportPage
