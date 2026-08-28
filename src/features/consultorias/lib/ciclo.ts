import {
  ANTECEDENCIA_POR_PAPEL,
  LIMITE_MOTIVO_CANCELAMENTO,
  MENSAGEM_PRAZO_POR_PAPEL,
  type PapelDoCiclo,
} from '../constants/ciclo'

/**
 * Quem pode mexer numa consultoria já contratada, e até quando.
 *
 * ## Só instantes absolutos
 *
 * A conta é `agora` contra `inicio_em` menos a antecedência do papel. Nenhum
 * fuso entra: fuso serve para *escrever* "14:30" na tela, nunca para decidir se
 * já passou. A forma errada — comparar textos de hora local — passa despercebida
 * numa máquina brasileira e erra na Vercel, que roda em UTC.
 *
 * ## A fronteira
 *
 * O intervalo é **fechado**: exatamente 2h00 antes ainda dá. `agora <= limite`.
 * Uma pessoa que clica no segundo exato do prazo cumpriu o prazo — recusá-la
 * seria cobrar uma precisão que ninguém tem, e a diferença prática é um
 * milissegundo.
 *
 * Para o Profissional a antecedência é zero, então o limite é o próprio início:
 * às 14:00:00 em ponto ele ainda cancela; às 14:00:01, não.
 */
export function limiteDaAlteracao(inicioEm: Date, papel: PapelDoCiclo): Date {
  return new Date(inicioEm.getTime() - ANTECEDENCIA_POR_PAPEL[papel] * 60_000)
}

export function dentroDoPrazo(
  inicioEm: Date,
  papel: PapelDoCiclo,
  agora: Date,
): boolean {
  return agora.getTime() <= limiteDaAlteracao(inicioEm, papel).getTime()
}

/**
 * A resposta completa: pode, e se não, por quê.
 *
 * Cancelar e remarcar compartilham exatamente esta função — os dois são "mexer
 * num compromisso que já existe", e ter duas cópias da regra só garantiria que
 * um dia elas discordassem sobre o mesmo minuto.
 */
export type VeredictoDoCiclo =
  | { pode: true }
  | { pode: false; motivo: 'ja_cancelada' | 'fora_do_prazo'; mensagem: string }

export function avaliarAlteracao(
  consultoria: { inicioEm: Date; status: string },
  papel: PapelDoCiclo,
  agora: Date,
): VeredictoDoCiclo {
  // Cancelada primeiro: uma consultoria desfeita não tem prazo a discutir, e
  // dizer "fora do prazo" para ela mandaria a pessoa olhar o relógio à toa.
  if (consultoria.status === 'cancelada') {
    return {
      pode: false,
      motivo: 'ja_cancelada',
      mensagem: 'Esta consultoria já foi cancelada.',
    }
  }
  if (!dentroDoPrazo(consultoria.inicioEm, papel, agora)) {
    return {
      pode: false,
      motivo: 'fora_do_prazo',
      mensagem: MENSAGEM_PRAZO_POR_PAPEL[papel],
    }
  }
  return { pode: true }
}

/**
 * Normaliza o motivo escrito à mão.
 *
 * Espaço em branco não é motivo: `"   "` vira ausência, e não um texto vazio
 * que a tela mostraria como uma linha em branco sob "Motivo:". O corte no
 * limite é a mesma defesa que o resto da plataforma aplica — validar no
 * servidor, e não confiar no `maxLength` do campo.
 */
export function normalizarMotivo(motivo: string | null | undefined): string | null {
  const limpo = (motivo ?? '').trim().replace(/\s+/g, ' ')
  if (!limpo) return null
  return limpo.slice(0, LIMITE_MOTIVO_CANCELAMENTO)
}
