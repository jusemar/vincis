import { Star } from 'lucide-react'
import type { PerfilPublicoDaPropostaDTO } from '../../types/oportunidade'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}

/**
 * O cartão público de um Profissional, do jeito que o Cliente já o conhece.
 *
 * Nasceu dentro de `PropostaRecebida` e saiu de lá quando a solicitação direta
 * passou a precisar do mesmo cartão: o Cliente escolheu aquela pessoa no perfil
 * dela, então ela aparece na própria solicitação, e não só quando responde. A
 * extração é literal — mesmo avatar, mesmas iniciais de fallback, mesma
 * estrela, mesmo traço para quem ainda não tem nota.
 *
 * Só o que é público entra. Telefone, e-mail e endereço não chegam a este DTO.
 */
export function CartaoPrestadorPublico({
  perfil,
  cidade,
  estado,
}: {
  perfil: PerfilPublicoDaPropostaDTO
  cidade?: string | null
  estado?: string | null
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {perfil.avatarUrl ? (
        <img
          src={perfil.avatarUrl}
          alt=""
          className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          {iniciais(perfil.nome)}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{perfil.nome}</p>
        {perfil.destaque ? (
          <p className="truncate text-xs text-muted-foreground">
            {perfil.destaque}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
            {/* Sem avaliação não é nota zero: o traço não inventa reputação. */}
            {perfil.avaliacaoMedia != null
              ? perfil.avaliacaoMedia.toFixed(1).replace('.', ',')
              : '—'}
          </span>
          <span>({perfil.totalAvaliacoes})</span>
          {cidade ? (
            <span>
              · {cidade}/{estado}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
