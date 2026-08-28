'use client'

import { Inbox } from 'lucide-react'
import { BannerDestaque } from '@/components/shared/BannerDestaque'
import { rotaDoDestino } from '@/features/notificacoes/lib/rota-do-destino'

/**
 * O banner do topo do Dashboard, no estado "chegou convite".
 *
 * Divide o mesmo espaço com o aviso de oportunidades e com a meta dourada — e
 * vem antes dos dois. A razão é de produto, não de tela: uma oportunidade é
 * aberta ao mercado e continua lá enquanto o prestador não responde; um convite
 * é dirigido a **esta** pessoa, tem prazo de validade e alguém do outro lado
 * esperando resposta.
 *
 * O desenho vem inteiro de `BannerDestaque`, o mesmo do aviso de oportunidades:
 * nenhuma cor, borda, tipografia ou botão novo foi criado aqui.
 *
 * O destino é o mesmo do clique no sino — a caixa de Convites de colaboração,
 * que continua sendo a única experiência de convite do produto. Com um convite
 * só, ele já abre analisado; com vários, a caixa abre na lista para a pessoa
 * escolher por onde começar.
 */
export function BannerConvites({
  novos,
  primeiroConviteId,
}: {
  novos: number
  /** Convite a abrir direto quando é o único novo. */
  primeiroConviteId: string | null
}) {
  const singular = novos === 1

  return (
    <BannerDestaque
      icone={Inbox}
      titulo={
        <>
          Você recebeu{' '}
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
            {novos}
          </span>{' '}
          {singular
            ? 'novo convite profissional.'
            : 'novos convites profissionais.'}
        </>
      }
      descricao={
        singular
          ? 'Outro profissional convidou você para participar de um atendimento. Analise os detalhes antes de responder.'
          : 'Outros profissionais convidaram você para participar de atendimentos. Analise os detalhes antes de responder.'
      }
      rotuloAcao={singular ? 'Ver convite' : 'Ver convites'}
      href={
        singular && primeiroConviteId
          ? rotaDoDestino({ pagina: 'atendimentos', conviteId: primeiroConviteId })
          : '/admin?pagina=atendimentos&convites=1'
      }
    />
  )
}
