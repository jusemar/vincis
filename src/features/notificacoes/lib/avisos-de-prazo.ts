import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, notificacoes } from '@/db/schema'
import { condicaoAlcanceAtendimento } from '@/features/atendimentos/lib/autorizacao'
import { obterAudienciaDoAtendimento } from '@/features/atendimentos/lib/audiencia'
import { TIPOS_NOTIFICACAO } from '../constants/notificacao'
import { emitirNotificacoes } from './emitir'

const UM_DIA = 24 * 60 * 60 * 1000

/** Mesma janela de "vence em breve" que o badge do card usa. */
export const JANELA_AVISO_PRAZO_DIAS = 3

/**
 * Avisa a equipe sobre prazos vencendo e vencidos.
 *
 * Prazo é das poucas coisas que pedem atenção sem ninguém ter feito nada — não
 * existe um clique que o dispare. Sem um agendador na infraestrutura, o gatilho
 * é a abertura do painel da própria pessoa: ao entrar, ela descobre o que está
 * apertado na carteira dela, e só na dela.
 *
 * A repetição é evitada em dois níveis. A consulta das últimas 24 horas evita
 * o trabalho inútil; a **chave de deduplicação** por Atendimento e dia é o que
 * garante o resultado, porque ela é conferida pelo índice único do banco no
 * momento do insert. Só a consulta não bastava: duas aberturas simultâneas do
 * painel liam "ainda não avisei" antes de qualquer uma gravar, e o mesmo prazo
 * virava dois avisos idênticos (foi o que aconteceu no #2026-0009).
 *
 * Enquanto não existir agendador na infraestrutura, a abertura do painel
 * continua sendo o gatilho — mas agora ela é idempotente: abrir dez vezes no
 * mesmo dia produz, no máximo, um aviso por pessoa.
 */
export async function emitirAvisosDePrazo(usuarioId: string, agora = new Date()) {
  const limiteProximo = new Date(agora.getTime() + JANELA_AVISO_PRAZO_DIAS * UM_DIA)

  const emRisco = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      prazoEm: atendimentos.prazoEm,
    })
    .from(atendimentos)
    .where(
      and(
        condicaoAlcanceAtendimento(usuarioId),
        isNotNull(atendimentos.prazoEm),
        lte(atendimentos.prazoEm, limiteProximo),
        // Atendimento encerrado não tem prazo a cobrar.
        sql`${atendimentos.status} not in ('concluido', 'recusado', 'cancelado')`,
      ),
    )

  if (!emRisco.length) return 0

  const desde = new Date(agora.getTime() - UM_DIA)
  const recentes = await db
    .select({
      atendimentoId: notificacoes.atendimentoId,
      tipo: notificacoes.tipo,
    })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, usuarioId),
        inArray(
          notificacoes.atendimentoId,
          emRisco.map(({ id }) => id),
        ),
        inArray(notificacoes.tipo, [TIPOS_NOTIFICACAO.prazoProximo]),
        gte(notificacoes.createdAt, desde),
      ),
    )

  const jaAvisados = new Set(
    recentes.map((linha) => `${linha.atendimentoId}:${linha.tipo}`),
  )

  let criadas = 0
  for (const atendimento of emRisco) {
    const chave = `${atendimento.id}:${TIPOS_NOTIFICACAO.prazoProximo}`
    if (jaAvisados.has(chave)) continue

    const vencido = atendimento.prazoEm! < agora
    const audiencia = await obterAudienciaDoAtendimento(db, atendimento.id)
    if (!audiencia) continue

    // Um aviso por Atendimento, por pessoa, por dia. O dia entra na chave para
    // que o lembrete possa voltar amanhã se o prazo continuar vencido — sem
    // ele, o aviso valeria para sempre e a cobrança sumiria depois da primeira.
    const dia = agora.toISOString().slice(0, 10)

    criadas += await emitirNotificacoes(db, {
      // Prazo é cobrança da equipe. O Cliente não é avisado de um
      // compromisso interno que ele não tem como cumprir.
      destinatarios: audiencia.equipe,
      // Nasce sem autor: ninguém provocou, o relógio andou. Um `autorId`
      // aqui faria a pessoa deixar de receber o aviso do próprio prazo.
      autorId: null,
      tipo: TIPOS_NOTIFICACAO.prazoProximo,
      titulo: vencido
        ? `${atendimento.protocolo} está com o prazo vencido`
        : `${atendimento.protocolo} vence em breve`,
      resumo: atendimento.titulo,
      recursoTipo: 'atendimento',
      recursoId: atendimento.id,
      atendimentoId: atendimento.id,
      protocolo: atendimento.protocolo,
      chaveDedupe: `${TIPOS_NOTIFICACAO.prazoProximo}:${atendimento.id}:${dia}`,
      destino: {
        pagina: 'atendimentos',
        atendimento: atendimento.protocolo,
        aba: 'info',
      },
    })
  }

  return criadas
}
