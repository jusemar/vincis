import { ContatoJaaa } from '@/features/suporte/components/ContatoJaaa'
import { LinkInterno, PaginaInstitucional } from './PaginaInstitucional'
import { ROTAS_INSTITUCIONAIS } from '../constants/rotas'

/**
 * "Fale com a Vincis": o canal público é a conversa com o Junior no Jaaa
 * (`ContatoJaaa`), no lugar dos cartões de e-mail e WhatsApp. Sem horário,
 * endereço ou prazo inventados.
 */
export function PaginaContato() {
  return (
    <PaginaInstitucional
      titulo="Fale com a Vincis"
      introducao="Precisa de ajuda com seu cadastro, contratação, pagamento ou atendimento? Entre em contato com a Vincis pelos canais abaixo."
    >
      <ContatoJaaa />
      <p className="text-base text-muted-foreground">
        Algumas dúvidas frequentes já estão respondidas na{' '}
        <LinkInterno href={ROTAS_INSTITUCIONAIS.centralDeAjuda}>Central de Ajuda</LinkInterno>.
      </p>
    </PaginaInstitucional>
  )
}
