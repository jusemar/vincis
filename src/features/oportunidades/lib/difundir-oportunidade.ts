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
 * Grava o aviso de uma solicitação **dirigida a um Profissional**.
 *
 * Mesmo mecanismo da pública — mesma tabela, mesmo recurso, mesmo destino, mesma
 * idempotência —, com um destinatário só e um texto que diz o que de fato
 * aconteceu: alguém escolheu esta pessoa. Nenhum prestador além dele é avisado,
 * e o payload continua sem dado de contato do Cliente.
 */
export async function difundirOportunidadeDireta(
  executor: ExecutorDb,
  oportunidade: {
    id: string
    categoria: CategoriaOportunidade
    titulo: string
    abrangencia: string
  },
  destinatarioId: string,
) {
  return emitirNotificacoes(executor, {
    destinatarios: [destinatarioId],
    // Sem autor, como na pública: identificar o Cliente antes de haver resposta
    // não acrescenta nada a quem decide se vai propor.
    autorId: null,
    tipo: TIPOS_NOTIFICACAO.oportunidadeDireta,
    titulo: 'Um cliente solicitou orçamento diretamente a você',
    resumo: resumirTexto(
      `${CATEGORIA_OPORTUNIDADE[oportunidade.categoria].rotulo} · ${oportunidade.titulo}`,
      200,
    ),
    recursoTipo: 'oportunidade',
    recursoId: oportunidade.id,
    atendimentoId: null,
    protocolo: null,
    destino: { pagina: 'oportunidades', oportunidadeId: oportunidade.id },
  })
}

/**
 * Avisa o Cliente de que o Profissional escolhido não vai propor.
 *
 * Só existe no fluxo privado, e a razão é a assimetria entre os dois: na
 * pública, "não tenho interesse" é uma decisão de agenda entre dezenas de
 * prestadores e o Cliente vê apenas um número agregado; na privada existe **um**
 * destinatário, e ficar esperando uma proposta que nunca virá é o pior desfecho
 * possível para quem pediu.
 *
 * O texto não é de rejeição: quem escolhe não participar está falando da própria
 * agenda, não da pessoa que pediu orçamento.
 */
export async function avisarClienteSemInteresse(
  executor: ExecutorDb,
  {
    oportunidadeId,
    titulo,
    clienteUsuarioId,
    prestadorId,
  }: {
    oportunidadeId: string
    titulo: string
    clienteUsuarioId: string
    prestadorId: string
  },
) {
  return emitirNotificacoes(executor, {
    destinatarios: [clienteUsuarioId],
    autorId: prestadorId,
    tipo: TIPOS_NOTIFICACAO.oportunidadeSemInteresse,
    titulo: 'O profissional não vai enviar proposta',
    resumo: resumirTexto(
      `${titulo} — você pode solicitar orçamento a outro profissional.`,
      200,
    ),
    recursoTipo: 'oportunidade',
    recursoId: oportunidadeId,
    atendimentoId: null,
    protocolo: null,
    // Mesmo destino que os demais avisos desta negociação usam.
    destino: { pagina: 'oportunidades', oportunidadeId },
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
