'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  oportunidadeDispensas,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { prestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { tipoPrestadorDoPerfil } from '@/features/usuarios/lib/tipos-pessoa'
import { ehPrivada, type CategoriaOportunidade } from '../constants/oportunidade'
import { obterVinculoComOportunidade } from '../lib/autorizacao'
import { ehFluxoDireto } from '../lib/fluxo-direto'
import { categoriasCompativeisDoPrestador } from '../lib/compatibilidade'
import {
  contarOportunidadesDisponiveis,
  listarOportunidadesDoPrestador,
} from '../queries/listar-oportunidades-do-prestador'
import {
  avisarClienteQueRespondeu,
  avisarClienteSemInteresse,
  avisarEmTempoReal,
} from '../lib/difundir-oportunidade'
import { limitarValidade, oportunidadeExpirada } from '../lib/vigencia-sql'
import {
  NovaPropostaSchema,
  OportunidadeIdSchema,
  converterValorParaCentavos,
} from '../schemas/oportunidade'

/**
 * A vitrine de oportunidades do prestador logado.
 *
 * Devolve o que a consulta já recorta: solicitações abertas e compatíveis, com
 * a proposta **do próprio** prestador quando existir. Proposta alheia não passa
 * por aqui em momento nenhum.
 *
 * A vitrine também não materializa vencimento — `condicaoOportunidadeAtiva` já
 * exclui a vencida mesmo antes de o agendador passar por ela.
 */
export async function carregarOportunidadesDisponiveis() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) return SEM_AUTORIZACAO_COM_DADOS

  const [lista, disponiveis] = await Promise.all([
    listarOportunidadesDoPrestador(sessao.id),
    contarOportunidadesDisponiveis(sessao.id),
  ])

  return {
    sucesso: true as const,
    mensagem: 'Oportunidades carregadas.',
    dados: { lista, disponiveis },
  }
}

/**
 * Envia (ou revisa) a proposta do prestador para uma oportunidade.
 *
 * Quatro verificações antes de gravar, todas no servidor:
 *
 * 1. é prestador habilitado — quem não pode operar não propõe;
 * 2. a oportunidade existe e está **aberta**;
 * 3. a categoria dela é compatível com o cadastro dele — não basta conhecer o
 *    id de uma solicitação para responder a ela;
 * 4. se a solicitação é **privada**, ele é o destinatário. Compatibilidade não
 *    basta aqui: outro contador, igualmente habilitado, não responde ao pedido
 *    que o Cliente dirigiu a alguém — nem com o id na mão;
 * 5. não é a própria solicitação — o mesmo id não pode ocupar as duas pontas.
 *
 * O conflito no índice único vira atualização: reenviar é revisar a proposta,
 * nunca criar uma segunda. É o banco que garante isso, não o código.
 */
export async function enviarProposta(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) {
    return semPermissaoPara('enviar propostas')
  }

  const validacao = NovaPropostaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Proposta inválida.',
    }
  }
  const dados = validacao.data

  const [perfil] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      especialidades: perfisProfissionais.especialidades,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, sessao.id))
    .limit(1)

  if (!prestadorHabilitado(perfil ?? null)) {
    return semPermissaoPara('enviar propostas')
  }

  const [oportunidade] = await db
    .select({
      id: oportunidades.id,
      categoria: oportunidades.categoria,
      titulo: oportunidades.titulo,
      origem: oportunidades.origem,
      status: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      visibilidade: oportunidades.visibilidade,
      destinatarioId: oportunidades.destinatarioId,
    })
    .from(oportunidades)
    .where(eq(oportunidades.id, dados.oportunidadeId))
    .limit(1)

  if (!oportunidade) {
    return { sucesso: false as const, mensagem: 'Oportunidade não encontrada.' }
  }
  /*
    A única condição que o fluxo direto acrescentou ao motor comercial.

    Não é uma regra a mais sobre proposta: é a recusa de criar a **única** coisa
    que destranca acordo, contraproposta, pagamento e Atendimento. Barrando
    aqui, todas as etapas seguintes ficam inalcançáveis para esta origem sem que
    nenhuma delas precise aprender o que é uma simulação de preços.

    Toda Oportunidade tradicional passa reto — inclusive as anteriores à coluna
    `origem`, que respondem `solicitacao` pelo default.
  */
  if (ehFluxoDireto(oportunidade.origem)) {
    return {
      sucesso: false as const,
      mensagem:
        'Esta solicitação é uma conversa direta com o cliente: use "Tenho interesse" e converse por aqui, sem proposta comercial.',
    }
  }
  // Vencida pelo relógio conta como fechada, mesmo que a coluna ainda diga
  // `aberta`: sem agendador, é a leitura que sustenta a regra.
  if (oportunidade.status !== 'aberta' || oportunidadeExpirada(oportunidade)) {
    return {
      sucesso: false as const,
      mensagem: 'Esta oportunidade não está mais aberta para propostas.',
    }
  }
  if (oportunidade.clienteUsuarioId === sessao.id) {
    return {
      sucesso: false as const,
      mensagem: 'Você não pode responder à sua própria solicitação.',
    }
  }

  const compativeis = categoriasCompativeisDoPrestador(perfil ?? null)
  if (
    !compativeis.includes(oportunidade.categoria as CategoriaOportunidade)
  ) {
    return semPermissaoPara('enviar proposta nesta categoria')
  }

  // Privada tem dono. A recusa é a mesma de uma solicitação inexistente, de
  // propósito: quem não é o destinatário não deve nem descobrir que ela existe.
  if (
    ehPrivada(oportunidade.visibilidade) &&
    oportunidade.destinatarioId !== sessao.id
  ) {
    return { sucesso: false as const, mensagem: 'Oportunidade não encontrada.' }
  }

  // Proposta sem valor é "a combinar"; um zero digitado não vira preço.
  const valorCentavos = converterValorParaCentavos(dados.valor) || null
  // A validade escolhida nunca ultrapassa o prazo global: uma proposta
  // aceitável depois de a solicitação expirar seria acordo fora do prazo.
  const { validaAte, limitada } = limitarValidade(
    dados.validadeHoras,
    oportunidade.expiraEm,
  )

  try {
    const [proposta] = await db
      .insert(oportunidadePropostas)
      .values({
        oportunidadeId: oportunidade.id,
        prestadorId: sessao.id,
        mensagem: dados.mensagem,
        valorCentavos,
        prazoEstimadoDias: dados.prazoEstimadoDias ?? null,
        validaAte,
      })
      .onConflictDoUpdate({
        target: [
          oportunidadePropostas.oportunidadeId,
          oportunidadePropostas.prestadorId,
        ],
        set: {
          mensagem: dados.mensagem,
          valorCentavos,
          prazoEstimadoDias: dados.prazoEstimadoDias ?? null,
          validaAte,
          updatedAt: new Date(),
        },
        // Proposta já aceita não é revisada: o acordo está fechado.
        where: eq(oportunidadePropostas.status, 'enviada'),
      })
      .returning({
        id: oportunidadePropostas.id,
        criadoEm: oportunidadePropostas.createdAt,
        atualizadoEm: oportunidadePropostas.updatedAt,
      })

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.propostaOportunidadeEnviada,
      entidade: 'oportunidade_propostas',
      registroAfetado: proposta.id,
      autorId: sessao.id,
      usuarioId: sessao.id,
      origem: 'admin',
      metadados: {
        oportunidadeId: oportunidade.id,
        categoria: oportunidade.categoria,
      },
    })

    // Enviar proposta supera uma dispensa anterior: o prestador mudou de
    // ideia, e manter a marca de "sem interesse" ao lado da proposta dele seria
    // contar duas histórias contraditórias sobre a mesma oportunidade.
    await db
      .delete(oportunidadeDispensas)
      .where(
        and(
          eq(oportunidadeDispensas.oportunidadeId, oportunidade.id),
          eq(oportunidadeDispensas.prestadorId, sessao.id),
        ),
      )

    /*
      Na solicitação **privada**, a resposta também vai para o sino.

      Simétrico ao "não tenho interesse", que já avisava: quem escolheu uma
      pessoa está esperando a resposta *dela*, e um evento em tempo real se
      perde para quem está com a aba fechada. A pública continua exatamente como
      era — lá o Cliente espera várias respostas, e o sino viraria um contador.
    */
    if (ehPrivada(oportunidade.visibilidade)) {
      await avisarClienteQueRespondeu(db, {
        oportunidadeId: oportunidade.id,
        titulo: oportunidade.titulo,
        clienteUsuarioId: oportunidade.clienteUsuarioId,
        prestadorId: sessao.id,
      })
    }

    // O Cliente é avisado de que há novidade; o conteúdo da proposta não viaja
    // no evento — a tela dele refaz a consulta, que aplica a autorização.
    await avisarEmTempoReal({
      destinatarios: [oportunidade.clienteUsuarioId],
      titulo: 'Você recebeu uma nova proposta',
      oportunidadeId: oportunidade.id,
      autorId: sessao.id,
    })

    revalidatePath('/admin')
    revalidatePath('/cliente')
    if (!proposta) {
      return {
        sucesso: false as const,
        mensagem: 'Esta proposta já foi aceita e não pode ser alterada.',
      }
    }

    return {
      sucesso: true as const,
      mensagem: limitada
        ? 'Proposta enviada. A validade foi ajustada para o fim do prazo da oportunidade.'
        : 'Proposta enviada ao cliente.',
      dados: { propostaId: proposta.id, validaAte: validaAte.toISOString() },
    }
  } catch (error) {
    console.error('[ENVIAR_PROPOSTA]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar sua proposta. Tente novamente.',
    }
  }
}

/**
 * "Não tenho interesse": tira a oportunidade da fila **deste** prestador.
 *
 * Não é recusa comercial e não encerra a solicitação — não existe contratação
 * para recusar nesta etapa. O efeito é individual: a oportunidade deixa de
 * contar no banner dele e não volta como nova no próximo F5, enquanto continua
 * valendo para todos os outros prestadores compatíveis.
 *
 * ## Na solicitação privada, a decisão é terminal
 *
 * É a única diferença entre os dois fluxos aqui, e ela vem de uma assimetria
 * real: na pública, um prestador entre dezenas sair da fila não muda o destino
 * da solicitação — ela continua valendo para todos os outros, o Cliente vê
 * apenas um número agregado e quem dispensou ainda pode mudar de ideia. Na
 * privada existe **um** destinatário: o que ele decide *é* o desfecho.
 *
 * Por isso a solicitação privada é encerrada aqui, na mesma transação:
 *
 * - `status` vira `encerrada` — para de aceitar proposta, contraproposta,
 *   acordo e pagamento pelas mesmas condições que já existiam, sem cláusula
 *   nova em consulta nenhuma;
 * - `motivo_encerramento` vira `sem_interesse`, porque `encerrada` sozinha
 *   contaria a história errada: o Cliente leria "acordo fechado";
 * - o Cliente é avisado, para não ficar esperando uma proposta que não vem.
 *
 * Nada é apagado. A dispensa, a solicitação e o histórico continuam, e quem
 * quiser insistir cria uma solicitação nova para o mesmo Profissional.
 *
 * O texto não é de rejeição: quem escolhe não participar está falando da
 * própria agenda, não da pessoa que pediu orçamento.
 *
 * A autorização é a mesma da vitrine: só dispensa quem poderia responder.
 * Conhecer o id de uma solicitação de outra categoria — ou de uma privada
 * dirigida a outra pessoa — não dá direito nem de marcá-la.
 */
export async function marcarSemInteresse(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO
  if (!tipoPrestadorDoPerfil(sessao.perfilTipo)) {
    return semPermissaoPara('dispensar oportunidades')
  }

  const validacao = OportunidadeIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Oportunidade inválida.' }
  }

  const vinculo = await obterVinculoComOportunidade(
    validacao.data.oportunidadeId,
    sessao.id,
  )
  if (vinculo !== 'prestador') {
    return semPermissaoPara('dispensar esta oportunidade')
  }

  const [oportunidade] = await db
    .select({
      id: oportunidades.id,
      titulo: oportunidades.titulo,
      status: oportunidades.status,
      visibilidade: oportunidades.visibilidade,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
    })
    .from(oportunidades)
    .where(eq(oportunidades.id, validacao.data.oportunidadeId))
    .limit(1)

  if (!oportunidade) {
    return { sucesso: false as const, mensagem: 'Oportunidade não encontrada.' }
  }
  // Só se dispensa o que ainda está em disputa. Sem esta guarda, quem venceu a
  // disputa — que continua alcançando a solicitação para acompanhar o acordo —
  // conseguiria marcar "não tenho interesse" depois de fechada e disparar ao
  // Cliente um aviso que contradiz o acordo que os dois já têm.
  if (oportunidade.status !== 'aberta') {
    return {
      sucesso: false as const,
      mensagem: 'Esta solicitação não está mais aberta.',
    }
  }

  const privada = ehPrivada(oportunidade.visibilidade)

  const dispensa = await db.transaction(async (tx) => {
    // Clicar duas vezes não grava duas linhas: quem garante é o índice único.
    const [linha] = await tx
      .insert(oportunidadeDispensas)
      .values({
        oportunidadeId: oportunidade.id,
        prestadorId: sessao.id,
      })
      .onConflictDoNothing()
      .returning({ id: oportunidadeDispensas.id })

    // O encerramento vai junto da dispensa: ou as duas coisas existem, ou
    // nenhuma. A cláusula `status = 'aberta'` é o que torna a repetição inócua
    // — uma segunda execução não alcança linha nenhuma.
    if (privada && linha) {
      await tx
        .update(oportunidades)
        .set({
          status: 'encerrada',
          motivoEncerramento: 'sem_interesse',
          encerradaEm: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(oportunidades.id, oportunidade.id),
            eq(oportunidades.status, 'aberta'),
          ),
        )
    }

    return linha ?? null
  })

  // `dispensa` vazio significa que já existia: o aviso ao Cliente não se
  // repete a cada clique.
  if (privada && dispensa) {
    await avisarClienteSemInteresse(db, {
      oportunidadeId: oportunidade.id,
      titulo: oportunidade.titulo,
      clienteUsuarioId: oportunidade.clienteUsuarioId,
      prestadorId: sessao.id,
    })
    await avisarEmTempoReal({
      destinatarios: [oportunidade.clienteUsuarioId],
      titulo: 'O profissional não vai enviar proposta',
      oportunidadeId: oportunidade.id,
      autorId: sessao.id,
    })
  }

  revalidatePath('/admin')
  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: privada
      ? 'Solicitação encerrada. O cliente foi avisado de que você não vai enviar proposta.'
      : 'Oportunidade removida da sua lista de pendências.',
  }
}
