'use client'

import { Target } from 'lucide-react'
import { BannerDestaque } from '@/components/shared/BannerDestaque'

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
 *
 * O desenho em si mudou de casa para `BannerDestaque` quando os convites de
 * colaboração passaram a disputar este mesmo espaço. O que se vê na tela é
 * exatamente o que era: a extração existe para que os dois assuntos não possam
 * divergir visualmente.
 *
 * As solicitações **diretas** entram neste mesmo estado — não em um banner
 * novo. O que muda é a frase, e só quando existe alguma: sem direta nenhuma, o
 * texto é caractere por caractere o que sempre foi.
 */
export function BannerOportunidades({
  pendentes,
  diretas = 0,
}: {
  pendentes: number
  /**
   * Quantas das pendentes foram dirigidas a **este** Profissional.
   *
   * Um Cliente que escolheu alguém no perfil dele espera resposta daquela
   * pessoa, e não de quem estiver disponível na categoria — a urgência é outra,
   * e o banner precisa dizer isso. Continua sendo **um** espaço de destaque:
   * quando não há nenhuma direta, o texto é exatamente o de sempre.
   */
  diretas?: number
}) {
  const singular = pendentes === 1
  const todasDiretas = diretas > 0 && diretas === pendentes

  if (todasDiretas) {
    return (
      <BannerDestaque
        icone={Target}
        titulo={
          singular ? (
            <>Você recebeu uma solicitação de orçamento direta.</>
          ) : (
            <>
              Você recebeu{' '}
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {pendentes}
              </span>{' '}
              solicitações de orçamento diretas.
            </>
          )
        }
        descricao={
          singular
            ? 'Um Cliente escolheu você no seu perfil e enviou a solicitação só para você. Analise e envie sua proposta.'
            : 'Clientes escolheram você no seu perfil e enviaram as solicitações só para você. Analise e envie suas propostas.'
        }
        rotuloAcao={singular ? 'Ver solicitação' : 'Ver solicitações'}
        href="/admin?pagina=oportunidades"
      />
    )
  }

  return (
    <BannerDestaque
      icone={Target}
      titulo={
        singular ? (
          <>Você tem uma nova oportunidade de serviço disponível.</>
        ) : (
          <>
            Você tem{' '}
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              {pendentes}
            </span>{' '}
            novas oportunidades de serviço disponíveis.
          </>
        )
      }
      descricao={
        diretas > 0
          ? `Clientes estão procurando profissionais da sua área — e ${diretas} ${diretas === 1 ? 'solicitação foi enviada diretamente' : 'solicitações foram enviadas diretamente'} para você. Analise e envie suas propostas.`
          : singular
            ? 'Um Cliente está procurando um profissional da sua área. Analise a solicitação e envie sua proposta.'
            : 'Clientes estão procurando profissionais da sua área. Analise as solicitações e envie suas propostas.'
      }
      rotuloAcao={singular ? 'Ver Oportunidade' : 'Ver Oportunidades'}
      href="/admin?pagina=oportunidades"
    />
  )
}
