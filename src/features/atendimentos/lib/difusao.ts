import {
  canalDoAtendimento,
  canalDoConvite,
  canalDoUsuario,
} from '@/integracoes/realtime/canais'
import {
  montarEvento,
  type EventoRealtime,
  type SeveridadeEvento,
  type TipoEventoRealtime,
} from '@/integracoes/realtime/eventos'
import { publicarEventos } from '@/integracoes/realtime/servidor'

/**
 * Difusão de um fato do Atendimento em tempo real.
 *
 * Chamada **depois** da transação, nunca dentro dela. A ordem é a do enunciado
 * e não é detalhe: grava, confirma, e só então avisa. Publicar antes do commit
 * criaria a chance de a outra ponta buscar um dado que ainda não existe — ou
 * que a transação vai desfazer.
 *
 * Dois destinos, com conteúdos diferentes de propósito:
 *
 * - o **canal de cada destinatário** leva o texto do toast, porque a lista de
 *   destinatários já é o recorte de audiência que o domínio decidiu (equipe ou
 *   equipe + Cliente);
 * - o **canal do Atendimento** leva apenas "algo mudou", sem texto, porque
 *   quem o assina é qualquer pessoa com vínculo — inclusive um participante que
 *   não deveria ler a resposta dirigida a outro no Protocolo.
 */
export type AvisoSegmentado = {
  /** Quem recebe o aviso pessoal. Vem da audiência do domínio. */
  destinatarios: string[]
  titulo: string
}

/**
 * Difusão com mais de uma redação, uma por audiência.
 *
 * Existe porque um mesmo fato costuma se dizer de duas maneiras: a conclusão é
 * "Seu atendimento foi concluído" para o Cliente e "#2026-0007 foi concluído
 * por Ana" para a equipe. Publicar duas vezes resolveria o texto e criaria
 * outro problema — o canal do Atendimento receberia o aviso em duplicata e cada
 * tela aberta refaria as consultas duas vezes.
 *
 * Aqui o canal do Atendimento é publicado **uma só vez**, sem texto, como
 * sempre; o que se repete são os canais pessoais, cada um com a frase da sua
 * audiência. Ninguém aparece em dois segmentos: o primeiro que citar uma pessoa
 * fica com ela, para que ninguém receba dois toasts do mesmo fato.
 */
export function montarEnviosSegmentados({
  tipo,
  atendimentoId,
  protocolo,
  autorId,
  avisos,
  aba = null,
  canalConversa = null,
  severidade = null,
}: {
  tipo: TipoEventoRealtime
  atendimentoId: string
  protocolo: string
  autorId: string | null
  avisos: AvisoSegmentado[]
  aba?: EventoRealtime['aba']
  canalConversa?: EventoRealtime['canalConversa']
  severidade?: SeveridadeEvento | null
}) {
  const base = {
    tipo,
    atendimentoId,
    protocolo,
    autorId,
    aba,
    canalConversa,
    severidade,
  }

  const jaAvisados = new Set<string>()
  const pessoais: { canal: string; evento: EventoRealtime }[] = []

  for (const aviso of avisos) {
    const evento = montarEvento({ ...base, titulo: aviso.titulo })
    for (const usuarioId of aviso.destinatarios) {
      if (!usuarioId || usuarioId === autorId || jaAvisados.has(usuarioId)) {
        continue
      }
      jaAvisados.add(usuarioId)
      pessoais.push({ canal: canalDoUsuario(usuarioId), evento })
    }
  }

  return [
    ...pessoais,
    {
      canal: canalDoAtendimento(atendimentoId),
      evento: montarEvento(base),
    },
  ]
}

export function montarEnviosDoAtendimento({
  destinatarios,
  titulo,
  ...resto
}: {
  tipo: TipoEventoRealtime
  atendimentoId: string
  protocolo: string
  autorId: string | null
  /** Quem recebe o aviso pessoal. Vem da audiência do domínio. */
  destinatarios: string[]
  titulo: string
  aba?: EventoRealtime['aba']
  canalConversa?: EventoRealtime['canalConversa']
  severidade?: SeveridadeEvento | null
}) {
  return montarEnviosSegmentados({
    ...resto,
    avisos: [{ destinatarios, titulo }],
  })
}

/** Monta e publica. Separado de `montarEnvios…` para o teste ler o payload. */
export function difundirNoAtendimento(
  entrada: Parameters<typeof montarEnviosDoAtendimento>[0],
) {
  return publicarEventos(montarEnviosDoAtendimento(entrada))
}

/** O mesmo, quando cada audiência recebe uma redação própria. */
export function difundirSegmentado(
  entrada: Parameters<typeof montarEnviosSegmentados>[0],
) {
  return publicarEventos(montarEnviosSegmentados(entrada))
}

/**
 * Difusão de um passo da negociação de convite.
 *
 * A negociação é privada entre duas pessoas, e por isso não passa pelo canal do
 * Atendimento: o valor combinado com um convidado não é assunto da equipe
 * inteira. Vai para os canais pessoais das partes e para o canal do convite.
 */
export function montarEnviosDoConvite({
  tipo,
  conviteId,
  atendimentoId,
  protocolo,
  autorId,
  destinatarios,
  titulo,
}: {
  tipo: 'convite' | 'negociacao'
  conviteId: string
  atendimentoId: string
  protocolo: string
  autorId: string | null
  destinatarios: string[]
  titulo: string
}) {
  const base = { tipo, conviteId, atendimentoId, protocolo, autorId }
  const paraPessoas = montarEvento({ ...base, titulo })
  const paraOConvite = montarEvento(base)

  const alvos = Array.from(new Set(destinatarios)).filter(
    (id) => id && id !== autorId,
  )

  return [
    ...alvos.map((usuarioId) => ({
      canal: canalDoUsuario(usuarioId),
      evento: paraPessoas,
    })),
    { canal: canalDoConvite(conviteId), evento: paraOConvite },
  ]
}

export function difundirNoConvite(
  entrada: Parameters<typeof montarEnviosDoConvite>[0],
) {
  return publicarEventos(montarEnviosDoConvite(entrada))
}
