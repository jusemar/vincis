import { and, eq, exists, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoParticipantes, atendimentos } from '@/db/schema'

export type AcessoAtendimento = {
  id: string
  prestadorId: string
  responsavelId: string
  clienteUsuarioId: string
  /** Como esta pessoa alcança o Atendimento. */
  vinculo: 'prestador' | 'responsavel' | 'participante' | 'cliente'
}

/**
 * Subconsulta: existe vínculo de participação desta pessoa neste Atendimento?
 *
 * Escrita uma vez e reaproveitada porque a participação é o vínculo mais fácil
 * de esquecer — e esquecê-la em um lugar só já basta para um convidado ver o
 * que não é dele, ou para deixar de ver o que é.
 */
function ehParticipante(usuarioId: string) {
  return exists(
    db
      .select({ existe: atendimentoParticipantes.id })
      .from(atendimentoParticipantes)
      .where(
        and(
          eq(atendimentoParticipantes.atendimentoId, atendimentos.id),
          eq(atendimentoParticipantes.usuarioId, usuarioId),
        ),
      ),
  )
}

/**
 * Recorte SQL de **todos** os Atendimentos que uma pessoa da operação alcança.
 *
 * Fonte única do isolamento: quadro, lista, busca, filtros, contadores,
 * indicadores do painel e qualquer consulta futura passam por aqui. Antes esta
 * condição estava copiada em dois arquivos, e cópia de regra de acesso é como
 * uma porta a mais na casa — cedo ou tarde alguém deixa uma destrancada.
 *
 * Alcançam o registro, e apenas eles:
 *
 * - o prestador dono (a fronteira da carteira);
 * - o responsável atual, mesmo que a carteira seja de outra pessoa;
 * - quem está em `atendimento_participantes` — e só **daquele** Atendimento.
 *
 * O Cliente proprietário **não** entra: a área dele tem consulta própria
 * (`listarAtendimentosDoCliente`), com outro recorte de conteúdo. Convite
 * pendente também não entra: participação só existe depois do aceite, e é isso
 * que impede um convite para um protocolo de virar acesso a outro.
 */
export function condicaoAlcanceAtendimento(usuarioId: string) {
  return or(
    eq(atendimentos.prestadorId, usuarioId),
    eq(atendimentos.responsavelId, usuarioId),
    ehParticipante(usuarioId),
  )
}

/**
 * Vínculos que respondem pelo Atendimento perante o Cliente.
 *
 * É a mesma régua que `participantes.ts` já aplica para decidir quem compõe a
 * equipe: o dono da carteira e o responsável atual. Um convidado — inclusive o
 * que entrou para analisar um ponto ou negociar um repasse — trabalha no
 * Atendimento, mas não o encerra em nome de quem foi contratado.
 *
 * O Cliente nunca aparece aqui: ele recebe a entrega, não a declara.
 */
export const VINCULOS_QUE_RESPONDEM = ['prestador', 'responsavel'] as const

/** Este vínculo pode encerrar o Atendimento? */
export function respondePeloAtendimento(
  vinculo: AcessoAtendimento['vinculo'] | undefined,
): boolean {
  return VINCULOS_QUE_RESPONDEM.some((permitido) => permitido === vinculo)
}

/**
 * Quem pode tocar num Atendimento.
 *
 * A pergunta é respondida no servidor a partir do vínculo gravado — nunca a
 * partir de um id que chegou na requisição. Alcançam o registro:
 *
 * - o prestador dono (a fronteira da carteira);
 * - o responsável atual;
 * - quem estiver em `atendimento_participantes` (os convidados de amanhã);
 * - o Cliente proprietário, para a área que será exposta a ele.
 *
 * Qualquer outro prestador, mesmo conhecendo o id, recebe `null`. Atendimento
 * não é público.
 */
export async function obterAcessoAtendimento(
  atendimentoId: string,
  usuarioId: string,
): Promise<AcessoAtendimento | null> {
  const [registro] = await db
    .select({
      id: atendimentos.id,
      prestadorId: atendimentos.prestadorId,
      responsavelId: atendimentos.responsavelId,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)

  if (!registro) return null

  if (registro.prestadorId === usuarioId) {
    return { ...registro, vinculo: 'prestador' }
  }
  if (registro.responsavelId === usuarioId) {
    return { ...registro, vinculo: 'responsavel' }
  }
  if (registro.clienteUsuarioId === usuarioId) {
    return { ...registro, vinculo: 'cliente' }
  }

  const [participante] = await db
    .select({ id: atendimentoParticipantes.id })
    .from(atendimentoParticipantes)
    .where(
      and(
        eq(atendimentoParticipantes.atendimentoId, atendimentoId),
        eq(atendimentoParticipantes.usuarioId, usuarioId),
      ),
    )
    .limit(1)

  return participante ? { ...registro, vinculo: 'participante' } : null
}
