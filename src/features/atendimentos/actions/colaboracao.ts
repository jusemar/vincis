'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { pesquisarProfissionaisReais } from '@/features/profissionais/queries/pesquisar-profissionais'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
} from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  TAMANHO_MAXIMO_ESCOPO_CONVITE,
  TAMANHO_MAXIMO_MENSAGEM_NEGOCIACAO,
  VALOR_MAXIMO_NEGOCIACAO_CENTAVOS,
} from '../constants/atendimento'
import { obterAcessoAtendimento } from '../lib/autorizacao'
import {
  adotarContraproposta,
  convidarParaAtendimento,
  escreverNaNegociacao,
  marcarNegociacaoComoLida,
  responderConvite,
  revogarConvite,
  type MotivoConvite,
} from '../lib/convites'
import {
  atribuirMembroDaEquipe,
  listarIdsDaEquipe,
  removerParticipante,
  type ResultadoParticipante,
} from '../lib/participantes'
import { obterContextoDoConvite } from '../queries/contexto-do-convite'
import {
  listarConvitesDaPessoa,
  listarConvitesDoAtendimento,
} from '../queries/convites-do-atendimento'
import { listarMembrosAtribuiveis } from '../queries/listar-membros-atribuiveis'

const AtendimentoSchema = z.object({
  atendimentoId: z.string().uuid('Atendimento inválido.'),
})

const MembroSchema = AtendimentoSchema.extend({
  membroId: z.string().uuid('Membro inválido.'),
})

const ParticipanteSchema = AtendimentoSchema.extend({
  participanteId: z.string().uuid('Participante inválido.'),
})

const PesquisaSchema = AtendimentoSchema.extend({
  busca: z.string().trim().max(100).default(''),
  profissao: z.string().optional().default('todos'),
  estado: z.string().max(2).optional().default(''),
  cidade: z.string().max(120).optional().default(''),
})

/**
 * Valor em centavos.
 *
 * Nulo é um valor legítimo: existe convite sem preço combinado — uma ajuda
 * pontual dentro da mesma rede. Zero seria diferente de nulo, e por isso não é
 * usado para representar ausência.
 */
const valorEmCentavos = z
  .number()
  .int('Informe um valor válido.')
  .min(0, 'O valor não pode ser negativo.')
  .max(VALOR_MAXIMO_NEGOCIACAO_CENTAVOS, 'Valor acima do limite permitido.')
  .nullable()

const ConviteSchema = AtendimentoSchema.extend({
  destinatarioId: z.string().uuid('Prestador inválido.'),
  escopo: z
    .string()
    .trim()
    .min(1, 'Descreva o que está sendo combinado.')
    .max(TAMANHO_MAXIMO_ESCOPO_CONVITE),
  valorOferecidoCentavos: valorEmCentavos.default(null),
})

/**
 * Uma linha da negociação.
 *
 * Texto e valor são ambos opcionais isoladamente, mas pelo menos um precisa
 * existir: o botão é único e decide o significado pelo que foi preenchido.
 * Escrever sem valor é mensagem; mandar valor sem texto é proposta.
 */
const NegociacaoSchema = z
  .object({
    conviteId: z.string().uuid('Convite inválido.'),
    conteudo: z
      .string()
      .trim()
      .max(TAMANHO_MAXIMO_MENSAGEM_NEGOCIACAO)
      .default(''),
    valorCentavos: valorEmCentavos.default(null),
  })
  .refine(
    (dados) => Boolean(dados.conteudo) || dados.valorCentavos !== null,
    { message: 'Escreva uma mensagem ou informe um valor.' },
  )

const RespostaSchema = z.object({
  conviteId: z.string().uuid('Convite inválido.'),
  resposta: z.enum(['aceitar', 'recusar']),
})

const ConviteIdSchema = z.object({
  conviteId: z.string().uuid('Convite inválido.'),
})

function atualizarTelas() {
  revalidatePath('/admin')
}

/** Mensagem única das recusas de convite — todas descrevem o mesmo domínio. */
function recusaConvite(motivo: MotivoConvite) {
  const textos: Record<string, string> = {
    'sem-acesso': 'Você não pode gerenciar a colaboração deste atendimento.',
    'nao-encontrado': 'Este convite não existe mais.',
    'destinatario-invalido': 'Este prestador não pode receber o convite.',
    'ja-participa': 'Esta pessoa já participa deste atendimento.',
    'ja-convidado': 'Já existe um convite ativo para esta pessoa neste atendimento.',
    encerrado: 'Este convite já foi respondido ou cancelado.',
    expirado: 'Este convite expirou.',
    vazio: 'Escreva o conteúdo antes de enviar.',
  }
  return {
    sucesso: false as const,
    mensagem: textos[motivo] ?? 'Não foi possível concluir a operação.',
  }
}

function recusaParticipante(
  resultado: Extract<ResultadoParticipante, { sucesso: false }>,
) {
  const textos: Record<string, string> = {
    'sem-acesso': 'Você não pode gerenciar os participantes deste atendimento.',
    'nao-encontrado': 'Este atendimento não existe mais.',
    'fora-da-equipe': 'Esta pessoa não pertence à sua equipe.',
    responsavel: 'O responsável não pode ser removido por aqui.',
    'ja-participa': 'Esta pessoa já participa deste atendimento.',
  }
  return {
    sucesso: false as const,
    mensagem: textos[resultado.motivo] ?? 'Não foi possível concluir a operação.',
  }
}

/** Membros da equipe disponíveis para atribuição direta. */
export async function listarMembrosParaAtribuir(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = AtendimentoSchema.safeParse(entrada)
  if (!validacao.success) return SEM_AUTORIZACAO_COM_DADOS

  return {
    sucesso: true as const,
    mensagem: 'Equipe carregada.',
    dados: await listarMembrosAtribuiveis(
      validacao.data.atendimentoId,
      sessao.id,
    ),
  }
}

/**
 * Atribui direto quem já pertence à equipe.
 *
 * Sem convite e sem negociação: o vínculo com o escritório já é o acordo. Quem
 * não pertence à equipe é recusado no domínio, mesmo que a tela ofereça o nome.
 */
export async function atribuirMembroAoAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = MembroSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const resultado = await atribuirMembroDaEquipe({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    membroId: validacao.data.membroId,
  })

  if (!resultado.sucesso) return recusaParticipante(resultado)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: resultado.alterado
      ? 'Membro atribuído ao atendimento.'
      : 'Esta pessoa já participava do atendimento.',
  }
}

/** Retira alguém do Atendimento. O responsável não sai por aqui. */
export async function removerParticipanteDoAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ParticipanteSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Dados inválidos.' }
  }

  const resultado = await removerParticipante({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    participanteId: validacao.data.participanteId,
  })

  if (!resultado.sucesso) return recusaParticipante(resultado)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: resultado.alterado
      ? 'Participante removido do atendimento.'
      : 'Esta pessoa já não participava do atendimento.',
  }
}

/**
 * Prestadores externos que podem ser convidados para este Atendimento.
 *
 * Reaproveita a mesma vitrine de prestadores habilitados usada pela colaboração
 * por Cliente e pela montagem de equipe — Profissional aprovado e Colaborador
 * ativo entram pela mesma porta. Quem já é da equipe é marcado como tal: o
 * caminho dele é a atribuição direta, não o convite.
 */
export async function pesquisarPrestadoresParaConvite(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = PesquisaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Busca inválida.',
      dados: null,
    }
  }

  const acesso = await obterAcessoAtendimento(
    validacao.data.atendimentoId,
    sessao.id,
  )
  if (!acesso || (acesso.vinculo !== 'prestador' && acesso.vinculo !== 'responsavel')) {
    return SEM_AUTORIZACAO_COM_DADOS
  }

  const [pesquisa, convites, equipe] = await Promise.all([
    pesquisarProfissionaisReais({
      busca: validacao.data.busca,
      profissao: validacao.data.profissao,
      estado: validacao.data.estado,
      cidade: validacao.data.cidade,
      // Sem isto a busca cairia no padrão da vitrine pública (só
      // profissionais) e um Colaborador jamais seria encontrado.
      tipoPrestador: 'todos',
      pagina: 1,
      porPagina: 20,
    }),
    listarConvitesDoAtendimento(validacao.data.atendimentoId, sessao.id),
    listarIdsDaEquipe(acesso.prestadorId),
  ])

  const vivos = new Map(
    convites
      .filter((convite) => convite.status === 'pendente' || convite.status === 'aceito')
      .map((convite) => [convite.destinatario.id, convite.status]),
  )

  const dados = pesquisa.profissionais
    .filter(
      ({ id }) =>
        id !== sessao.id &&
        id !== acesso.clienteUsuarioId &&
        id !== acesso.responsavelId,
    )
    .map((item) => ({
      usuarioId: item.id,
      nome: item.nome,
      avatarUrl: item.avatarUrl,
      tipoPrestador: item.tipoPrestador,
      tipoProfissional: item.profissao,
      cidade: item.cidade,
      estado: item.estado,
      formacao: item.formacao,
      numeroRegistro: item.numeroRegistro,
      especialidades: item.especialidades,
      valorHoraCentavos: item.valorHoraCentavos,
      situacao: (vivos.get(item.id) === 'aceito'
        ? 'participando'
        : vivos.get(item.id) === 'pendente'
          ? 'convite_pendente'
          : equipe.has(item.id)
            ? 'equipe'
            : 'disponivel') as
        | 'participando'
        | 'convite_pendente'
        | 'equipe'
        | 'disponivel',
    }))

  return { sucesso: true as const, mensagem: 'Pesquisa concluída.', dados }
}

/** Convites deste Atendimento, com a negociação de quem está lendo. */
export async function carregarConvitesDoAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = AtendimentoSchema.safeParse(entrada)
  if (!validacao.success) return SEM_AUTORIZACAO_COM_DADOS

  return {
    sucesso: true as const,
    mensagem: 'Convites carregados.',
    dados: await listarConvitesDoAtendimento(
      validacao.data.atendimentoId,
      sessao.id,
    ),
  }
}

/**
 * Convida um prestador externo para este Atendimento.
 *
 * O convite não dá acesso: dá o direito de analisar o recorte limitado e de
 * negociar. A entrada acontece no aceite.
 */
export async function convidarPrestadorParaAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConviteSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Convite inválido.',
    }
  }

  const resultado = await convidarParaAtendimento({
    atendimentoId: validacao.data.atendimentoId,
    usuarioId: sessao.id,
    destinatarioId: validacao.data.destinatarioId,
    escopo: validacao.data.escopo,
    valorOferecidoCentavos: validacao.data.valorOferecidoCentavos,
  })

  if (!resultado.sucesso) return recusaConvite(resultado.motivo)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: 'Convite enviado. O prestador vai analisar e responder.',
    dados: { id: resultado.id },
  }
}

/**
 * Caixa de convites da pessoa: os que ela recebeu e os que ela enviou.
 *
 * Nome mantido por já ser consumido pelo quadro; o conteúdo cresceu para os
 * dois lados, porque quem envia também precisa achar a resposta.
 */
export async function carregarConvitesRecebidos() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  return {
    sucesso: true as const,
    mensagem: 'Convites carregados.',
    dados: await listarConvitesDaPessoa(sessao.id),
  }
}

/** Quem convidou adota o valor pedido pelo convidado, sem redigitar. */
export async function adotarContrapropostaConvite(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConviteIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Convite inválido.' }
  }

  const resultado = await adotarContraproposta({
    conviteId: validacao.data.conviteId,
    usuarioId: sessao.id,
  })
  if (!resultado.sucesso) {
    return resultado.motivo === 'vazio'
      ? { sucesso: false as const, mensagem: 'Não há contraproposta para adotar.' }
      : recusaConvite(resultado.motivo)
  }

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem: 'Contraproposta adotada. Agora ela é o valor da proposta.',
  }
}

/** Marca a negociação de um convite como lida por quem está lendo. */
export async function marcarNegociacaoLida(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConviteIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Convite inválido.' }
  }

  const resultado = await marcarNegociacaoComoLida({
    conviteId: validacao.data.conviteId,
    usuarioId: sessao.id,
  })
  if (!resultado.sucesso) return recusaConvite(resultado.motivo)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Negociação lida.' }
}

/** Recorte do Atendimento que o convidado analisa antes de decidir. */
export async function obterContextoConvite(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = ConviteIdSchema.safeParse(entrada)
  if (!validacao.success) return SEM_AUTORIZACAO_COM_DADOS

  const contexto = await obterContextoDoConvite(
    validacao.data.conviteId,
    sessao.id,
  )
  if (!contexto) return SEM_AUTORIZACAO_COM_DADOS

  return { sucesso: true as const, mensagem: 'Contexto carregado.', dados: contexto }
}

/**
 * Escreve na negociação privada do convite.
 *
 * O tipo da linha (proposta ou contraproposta) não vem da tela: é derivado do
 * lado em que a pessoa está, no servidor.
 */
export async function escreverNegociacaoConvite(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = NegociacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Mensagem inválida.',
    }
  }

  const resultado = await escreverNaNegociacao({
    conviteId: validacao.data.conviteId,
    usuarioId: sessao.id,
    conteudo: validacao.data.conteudo,
    valorCentavos: validacao.data.valorCentavos,
  })

  if (!resultado.sucesso) return recusaConvite(resultado.motivo)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem:
      validacao.data.valorCentavos === null
        ? 'Mensagem enviada.'
        : 'Valor registrado na negociação.',
  }
}

/** Aceite ou recusa — só de quem foi convidado. */
export async function responderConviteAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = RespostaSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Resposta inválida.' }
  }

  const resultado = await responderConvite({
    conviteId: validacao.data.conviteId,
    usuarioId: sessao.id,
    resposta: validacao.data.resposta,
  })

  if (!resultado.sucesso) return recusaConvite(resultado.motivo)

  atualizarTelas()
  return {
    sucesso: true as const,
    mensagem:
      validacao.data.resposta === 'aceitar'
        ? 'Convite aceito. O atendimento já aparece no seu quadro.'
        : 'Convite recusado.',
  }
}

/** Cancela um convite ainda pendente. */
export async function cancelarConviteAtendimento(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = ConviteIdSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: 'Convite inválido.' }
  }

  const resultado = await revogarConvite({
    conviteId: validacao.data.conviteId,
    usuarioId: sessao.id,
  })

  if (!resultado.sucesso) return recusaConvite(resultado.motivo)

  atualizarTelas()
  return { sucesso: true as const, mensagem: 'Convite cancelado.' }
}
