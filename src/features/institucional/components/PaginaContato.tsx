import { ContatoProtegido } from './ContatoProtegido'
import { LinkInterno, PaginaInstitucional } from './PaginaInstitucional'
import { ROTAS_INSTITUCIONAIS } from '../constants/rotas'

/** "Fale com a Vincis": os dois canais oficiais, sem horário, endereço ou prazo inventados. */
export function PaginaContato() {
  return (
    <PaginaInstitucional
      titulo="Fale com a Vincis"
      introducao="Precisa de ajuda com seu cadastro, contratação, pagamento ou atendimento? Entre em contato com a Vincis pelos canais abaixo."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ContatoProtegido canal="email" variante="cartao" />
        <ContatoProtegido canal="whatsapp" variante="cartao" />
      </div>
      <p className="text-base text-muted-foreground">
        Algumas dúvidas frequentes já estão respondidas na{' '}
        <LinkInterno href={ROTAS_INSTITUCIONAIS.centralDeAjuda}>Central de Ajuda</LinkInterno>.
      </p>
    </PaginaInstitucional>
  )
}
