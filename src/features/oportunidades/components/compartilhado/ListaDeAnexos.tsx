import { Paperclip } from 'lucide-react'
import type { AnexoOportunidadeDTO } from '../../types/oportunidade'
import { formatarTamanho } from './formato'

/**
 * Anexos de uma solicitação.
 *
 * O link aponta sempre para a rota autorizada (`/api/oportunidades/.../
 * arquivos/...`), nunca para o armazenamento: quem clicar sem vínculo com a
 * solicitação recebe 404 do servidor, e não o arquivo. A mesma lista serve às
 * duas visões — o Cliente dono e o prestador compatível — porque a autorização
 * não é da tela, é da rota.
 */
export function ListaDeAnexos({
  anexos,
}: {
  anexos: AnexoOportunidadeDTO[]
}) {
  if (!anexos.length) return null

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {anexos.map((anexo) => (
        <li key={anexo.id}>
          <a
            href={anexo.url}
            className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs transition-colors hover:bg-accent"
          >
            <Paperclip className="size-3.5 text-muted-foreground" />
            <span className="max-w-52 truncate font-medium">{anexo.nome}</span>
            <span className="text-muted-foreground">
              {formatarTamanho(anexo.tamanhoBytes)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
