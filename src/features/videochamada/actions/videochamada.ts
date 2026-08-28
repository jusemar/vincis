'use server'

import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { atendimentos, consultoriaAgendamentos, usuarios } from '@/db/schema'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  MENSAGENS_DA_JANELA,
  MENSAGEM_FALHA_VIDEOCHAMADA,
  MENSAGEM_CONSULTORIA_CANCELADA,
  MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA,
  MENSAGEM_SESSAO_NECESSARIA,
} from '../constants/videochamada'
import { criarTokenDeReuniao } from '../lib/daily/cliente-daily'
import { ehErroDaily } from '../lib/daily/erros'
import { janelaDaVideochamada, situacaoDaJanela } from '../lib/janela'
import { garantirSalaDaConsultoria, paraUnix } from '../lib/sala'
import type { ResultadoDeEntrada } from '../types/videochamada'

const EntrarSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
})

/**
 * Autoriza — ou recusa — a entrada de **uma** pessoa nesta videochamada.
 *
 * ## O que o navegador pode dizer
 *
 * Um id de Atendimento. Nada mais. Nem quem ele é, nem que nome quer exibir,
 * nem qual sala quer abrir, nem que horas são. Tudo isso o servidor descobre
 * sozinho — e é essa assimetria que faz a checagem valer alguma coisa. Aceitar
 * `clienteId`, `prestadorId` ou `roomName` do browser transformaria a
 * autorização num pedido de gentileza.
 *
 * ## Por que a URL da sala não é autorização
 *
 * A sala é privada: quem tiver a URL e não tiver token vê uma porta fechada. O
 * token é emitido aqui, depois de quatro perguntas — há sessão? a conta está
 * apta? esta pessoa é parte desta consultoria? a janela está aberta? — e nunca
 * antes. Descobrir o `room_name` alheio não ajuda: o token carrega `room_name`
 * gravado dentro dele e é emitido para a sala **desta** consultoria, a partir
 * da linha que o `where` abaixo encontrou.
 *
 * ## Quem entra
 *
 * O Cliente que contratou e o Profissional contratado. Ninguém mais — nem outro
 * participante do Atendimento, nem um colega de escritório, nem o Gestor da
 * Vincis. Ser Gestor dá acesso administrativo à plataforma; não dá assento numa
 * consulta entre duas pessoas. Por isso o `where` compara com as colunas do
 * **agendamento** (as partes do contrato), e não com a lista de participantes
 * do Atendimento, que é maior de propósito.
 *
 * ## O token não é gerado por carregar a página
 *
 * Só por clicar. Emitir na renderização daria a cada `F5` uma credencial nova,
 * válida por toda a janela, para uma pessoa que talvez nem vá entrar.
 */
export async function entrarNaVideochamada(
  entrada: z.input<typeof EntrarSchema>,
): Promise<ResultadoDeEntrada> {
  const validado = EntrarSchema.safeParse(entrada)
  if (!validado.success) {
    return { situacao: 'sem_acesso', mensagem: MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA }
  }

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    return {
      situacao: 'sem_sessao',
      mensagem:
        estado === 'nao_confirmada'
          ? 'Confirme sua conta para acessar a videochamada.'
          : estado === 'bloqueada'
            ? MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA
            : MENSAGEM_SESSAO_NECESSARIA,
    }
  }

  /**
   * A autorização mora no `where`, e não num `if` depois da consulta.
   *
   * A consultoria de outra pessoa não é carregada, não é serializada e não
   * chega até aqui para ser recusada — ela simplesmente não existe para esta
   * sessão. É a mesma forma que as listas das Áreas do Cliente e do
   * Profissional já usam.
   */
  const [consultoria] = await db
    .select({
      agendamentoId: consultoriaAgendamentos.id,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
      clienteUsuarioId: consultoriaAgendamentos.clienteUsuarioId,
      prestadorId: consultoriaAgendamentos.prestadorId,
      status: consultoriaAgendamentos.status,
      nomeDoUsuario: usuarios.nome,
    })
    .from(atendimentos)
    .innerJoin(
      consultoriaAgendamentos,
      eq(consultoriaAgendamentos.id, atendimentos.consultoriaAgendamentoId),
    )
    .innerJoin(usuarios, eq(usuarios.id, sessao.id))
    .where(
      and(
        eq(atendimentos.id, validado.data.atendimentoId),
        or(
          eq(consultoriaAgendamentos.clienteUsuarioId, sessao.id),
          eq(consultoriaAgendamentos.prestadorId, sessao.id),
        ),
      ),
    )
    .limit(1)

  // Atendimento inexistente, Atendimento que não é de consultoria e consultoria
  // de outra pessoa devolvem exatamente a mesma coisa — de propósito. Um erro
  // diferente para cada caso ensinaria, a quem estivesse tentando, qual dos
  // três chutes chegou mais perto.
  if (!consultoria) {
    return { situacao: 'sem_acesso', mensagem: MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA }
  }

  /**
   * Consultoria desmarcada não tem sala.
   *
   * Antes da janela, e não junto com ela: o horário de uma consultoria
   * cancelada continua existindo na linha, então a janela dela continua
   * "abrindo" — o que abriria a porta de um encontro que ninguém mais espera.
   * Quem desmarcou não deve encontrar o outro lado esperando na sala.
   */
  if (consultoria.status === 'cancelada') {
    return { situacao: 'sem_acesso', mensagem: MENSAGEM_CONSULTORIA_CANCELADA }
  }

  const agora = new Date()
  const janela = janelaDaVideochamada(consultoria)
  const situacao = situacaoDaJanela(janela, agora)
  if (situacao !== 'aberta') {
    return {
      situacao: 'fora_da_janela',
      janela: situacao,
      mensagem: MENSAGENS_DA_JANELA[situacao],
    }
  }

  try {
    const sala = await garantirSalaDaConsultoria(consultoria.agendamentoId, janela)

    /**
     * A identidade vem da sessão — a linha de `usuarios` que o `innerJoin`
     * trouxe pelo id do cookie, não um campo do formulário. É por isso que
     * ninguém aparece na chamada com o nome de outra pessoa.
     *
     * O `user_id` é o uuid interno: 36 caracteres, exatamente o limite da
     * Daily, e opaco — não conta e-mail, telefone nem CPF a quem inspecionar a
     * chamada.
     */
    const token = await criarTokenDeReuniao({
      nomeDaSala: sala.name,
      nomeExibido: consultoria.nomeDoUsuario,
      usuarioId: sessao.id,
      nbf: paraUnix(janela.abreEm),
      exp: paraUnix(janela.fechaEm),
    })

    return {
      situacao: 'autorizado',
      url: sala.url,
      token,
      nomeExibido: consultoria.nomeDoUsuario,
      expiraEm: janela.fechaEm.toISOString(),
    }
  } catch (erro) {
    /**
     * O log leva identificadores internos e a etiqueta do erro. Não leva a
     * chave, não leva o token, não leva o header e não leva nome de ninguém —
     * um log de produção é lido por muita gente, e a consulta é privada.
     */
    console.error('[ENTRAR_VIDEOCHAMADA]', {
      atendimentoId: validado.data.atendimentoId,
      agendamentoId: consultoria.agendamentoId,
      codigo: ehErroDaily(erro) ? erro.codigo : 'inesperado',
    })
    return { situacao: 'falha', mensagem: MENSAGEM_FALHA_VIDEOCHAMADA }
  }
}
