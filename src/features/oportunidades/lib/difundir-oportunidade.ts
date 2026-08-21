import { eq } from 'drizzle-orm'
import { perfisProfissionais, usuarios } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import { canalDoUsuario } from '@/integracoes/realtime/canais'
import { montarEvento } from '@/integracoes/realtime/eventos'
import { publicarEventos } from '@/integracoes/realtime/servidor'
import {
  CATEGORIA_OPORTUNIDADE,
  type CategoriaOportunidade,
} from '../constants/oportunidade'
import { condicaoPrestadorCompativel } from './compatibilidade'

/**
 * Descobre quem deve ser avisado de uma oportunidade.
 *
 * Todo prestador compatível entra — sem ranking, sem rodízio, sem teto. É a
 * regra desta etapa, e ela fica aqui, num lugar só, para que uma distribuição
 * futura tenha um ponto óbvio onde nascer.
 */
export async function destinatariosDaOportunidade(
  executor: ExecutorDb,
  categoria: CategoriaOportunidade,
) {
  const compativeis = await executor
    .select({ id: usuarios.id })
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(condicaoPrestadorCompativel(categoria))

  return compativeis.map(({ id }) => id)
}

/**
 * Grava os avisos de uma oportunidade nova.
 *
 * Recebe um `ExecutorDb` para gravar dentro da mesma transação da oportunidade:
 * ou a solicitação e os avisos existem, ou nenhum dos dois. Um aviso de
 * oportunidade que a transação desfez levaria o prestador a uma tela vazia.
 *
 * O aviso não carrega dado de contato do Cliente: título e resumo são a
 * categoria e o começo da descrição — exatamente o que a tela de Oportunidades
 * já mostraria a quem clicar.
 */
export async function difundirOportunidade(
  executor: ExecutorDb,
  oportunidade: {
    id: string
    categoria: CategoriaOportunidade
    titulo: string
    abrangencia: string
  },
  destinatarios: string[],
) {
  if (!destinatarios.length) return 0

  return emitirNotificacoes(executor, {
    destinatarios,
    // Nasce sem autor: o Cliente pediu um orçamento à plataforma, não a uma
    // pessoa. Marcar o autor aqui também exporia quem solicitou antes da hora.
    autorId: null,
    tipo: TIPOS_NOTIFICACAO.oportunidadeDisponivel,
    titulo: `Nova oportunidade em ${CATEGORIA_OPORTUNIDADE[oportunidade.categoria].rotulo}`,
    resumo: resumirTexto(
      `${oportunidade.titulo} · ${oportunidade.abrangencia}`,
      200,
    ),
    recursoTipo: 'oportunidade',
    recursoId: oportunidade.id,
    // Oportunidade não pertence a Atendimento nenhum: é a etapa anterior.
    atendimentoId: null,
    protocolo: null,
    destino: { pagina: 'oportunidades', oportunidadeId: oportunidade.id },
  })
}

/**
 * Publica o aviso em tempo real, **depois** do commit.
 *
 * A ordem é a mesma do Atendimento e não é detalhe: grava, confirma, e só
 * então avisa. Publicar antes do commit criaria a chance de a outra ponta
 * buscar um dado que ainda não existe — ou que a transação vai desfazer.
 *
 * O evento leva só o título e o id: descrição, valor pretendido e anexos ficam
 * de fora, porque o canal de tempo real não é uma segunda porta para o dado. A
 * tela recebe "algo mudou" e refaz a consulta, que aplica autorização.
 */
export async function avisarEmTempoReal({
  destinatarios,
  titulo,
  oportunidadeId,
  autorId = null,
}: {
  destinatarios: string[]
  titulo: string
  oportunidadeId: string
  autorId?: string | null
}) {
  if (!destinatarios.length) return
  await publicarEventos(
    destinatarios.map((usuarioId) => ({
      canal: canalDoUsuario(usuarioId),
      evento: montarEvento({
        tipo: 'oportunidade',
        autorId,
        titulo,
        oportunidadeId,
        severidade: 'informacao',
      }),
    })),
  )
}
