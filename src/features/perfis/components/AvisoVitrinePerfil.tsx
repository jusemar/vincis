import Link from 'next/link'
import { ImageOff, EyeOff } from 'lucide-react'
import type { SituacaoVitrinePerfil } from '../queries/situacao-vitrine'

/**
 * Aviso exibido só ao dono do perfil quando ele está fora da vitrine pública.
 * Sem foto: orienta a completar o cadastro. Ocultado pela Gestão: orienta a
 * falar com o suporte (o motivo interno não é exposto).
 */
export function AvisoVitrinePerfil({ situacao }: { situacao: SituacaoVitrinePerfil }) {
  const Icone = situacao.ocultoPelaGestao ? EyeOff : ImageOff
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
    >
      <Icone className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">Seu perfil não aparece na busca pública no momento.</p>
        {situacao.semFoto && (
          <p className="text-muted-foreground">
            Perfis sem foto não são exibidos na vitrine. Adicione sua foto (ou o logotipo do escritório) em{' '}
            <Link href="/admin?pagina=profile" className="font-semibold text-primary underline underline-offset-4">
              Meu perfil
            </Link>{' '}
            para voltar a aparecer. Quem já tem o seu link continua acessando esta página.
          </p>
        )}
        {situacao.ocultoPelaGestao && (
          <p className="text-muted-foreground">
            Ele foi retirado da vitrine pela equipe Vincis. Em caso de dúvida, fale com o{' '}
            <Link href="/suporte" className="font-semibold text-primary underline underline-offset-4">
              suporte
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}
