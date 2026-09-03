'use server'

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { oportunidades } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { resumirTexto } from '@/features/notificacoes/lib/emitir'
import type { CategoriaOportunidade } from '@/features/oportunidades/constants/oportunidade'
import {
  avisarEmTempoReal,
  difundirOportunidadeDireta,
} from '@/features/oportunidades/lib/difundir-oportunidade'
import { obterDestinatarioPrivado } from '@/features/oportunidades/queries/obter-destinatario-privado'
import { formatarCentavos } from '@/features/precificacao/lib/formato'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
import { SERVICO_DO_PROFISSIONAL } from '../constants/precificacao-profissional'
import { assinaturaDaSimulacao, montarSimulacao } from '../lib/simulacao'
import { obterPrecificacaoPublicaDoProfissional } from '../queries/precificacao-publica'
import { InteresseNaSimulacaoSchema } from '../schemas/interesse'

const CONTA_NAO_CONFIRMADA =
  'Sua conta ainda não foi confirmada. Confirme pelo link enviado ao seu e-mail ou fale com a Vincis pelo WhatsApp cadastrado para demonstrar interesse.'

const PRECISA_ENTRAR =
  'Entre ou crie sua conta para demonstrar interesse. Sua simulação continua aqui.'

function recusa(mensagem: string, extras: Record<string, boolean> = {}) {
  return {
    sucesso: false as const,
    mensagem,
    precisaEntrar: false,
    contaNaoConfirmada: false,
    ...extras,
  }
}

/**
 * "Tenho interesse": a simulação de preços vira uma Oportunidade.
 *
 * ## Não é contratação, e a estrutura diz isso
 *
 * O que nasce aqui é uma solicitação **privada** na tabela de sempre. Não há
 * pedido, checkout, assinatura, cobrança nem comissão em lugar nenhum deste
 * caminho — nenhuma dessas tabelas é sequer importada. O preço guardado é o que
 * o cliente viu, e é retrato, não proposta: valor comercial só existe quando o
 * Profissional envia uma proposta, que é ato dele.
 *
 * ## Cinco portas, todas no servidor
 *
 * 1. **sessão válida** — que nesta plataforma já significa conta confirmada;
 * 2. **ser Cliente** — prestador e Gestor não demonstram interesse em si mesmos
 *    nem em concorrentes;
 * 3. **o Profissional publicou preço** — a mesma consulta que serve a página
 *    pública, com as mesmas três portas. Se ele despublicou entre a simulação e
 *    o clique, não há o que congelar;
 * 4. **as respostas existem na grade dele** — quem confere é o motor, ao
 *    calcular. Resposta inventada não vira retrato;
 * 5. **ele pode receber solicitação privada** — `obterDestinatarioPrivado`, o
 *    mesmo portão do formulário do perfil.
 *
 * ## O preço é recalculado, nunca recebido
 *
 * O navegador manda **respostas**, não valores. O motor roda aqui, sobre a
 * tabela publicada, e o número que sai é o mesmo que a página exibiu — porque é
 * o mesmo motor sobre a mesma tabela. Aceitar o valor do cliente deixaria
 * qualquer pessoa gravar "este profissional cobraria R$ 1,00".
 *
 * ## O destinatário vem do banco, não da URL
 *
 * `prestadorId` é só uma chave de consulta: quem decide se aquela pessoa existe,
 * está habilitada, publicou preço e atende a categoria é o banco. Trocar a query
 * string apenas escolhe outra consulta — que aplica exatamente as mesmas portas.
 */
export async function demonstrarInteresseNaSimulacao(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    return {
      sucesso: false as const,
      mensagem:
        estado === 'nao_confirmada' ? CONTA_NAO_CONFIRMADA : PRECISA_ENTRAR,
      precisaEntrar: estado !== 'nao_confirmada',
      contaNaoConfirmada: estado === 'nao_confirmada',
    }
  }

  if (!podeAgirComoCliente(sessao)) {
    return recusa(
      'Apenas contas de Cliente podem demonstrar interesse em um profissional.',
    )
  }

  const validacao = InteresseNaSimulacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return recusa(
      validacao.error.issues[0]?.message ?? 'Simulação inválida.',
    )
  }
  const { prestadorId, respostas } = validacao.data

  if (prestadorId === sessao.id) {
    return recusa('Você não pode demonstrar interesse em você mesmo.')
  }

  const precificacao = await obterPrecificacaoPublicaDoProfissional(prestadorId)
  if (!precificacao) {
    return recusa(
      'Este profissional não está com a tabela de preços publicada no momento.',
    )
  }

  let precoMensalCentavos: number
  try {
    precoMensalCentavos = calcularPreco(
      precificacao.tabela,
      SERVICO_DO_PROFISSIONAL,
      respostas,
    ).mensalCentavos
  } catch {
    // A grade mudou entre o carregamento da página e o clique. Refazer a
    // simulação é honesto; gravar um cenário que o motor não aceita, não.
    return recusa(
      'A tabela deste profissional mudou. Refaça a simulação para continuar.',
    )
  }

  const destinatario = await obterDestinatarioPrivado(prestadorId)
  if (!destinatario) {
    return recusa(
      'Este profissional não está disponível para receber solicitações.',
    )
  }

  // A tabela individual precifica a rotina contábil. Se o cadastro dele não
  // alcançar essa categoria, a primeira compatível é a que vale — e a lista
  // nunca é vazia, `obterDestinatarioPrivado` já garantiu.
  const categoria: CategoriaOportunidade = destinatario.categorias.includes(
    'contabilidade',
  )
    ? 'contabilidade'
    : destinatario.categorias[0]

  const simulacao = montarSimulacao({
    tabela: precificacao.tabela,
    respostas,
    profissionalId: prestadorId,
    precoMensalCentavos,
  })
  const chaveIntencao = assinaturaDaSimulacao(simulacao)

  /**
   * Já existe esta mesma intenção viva?
   *
   * A consulta responde rápido no caso comum — o cliente que volta e clica de
   * novo recebe a solicitação que já tem, sem erro na cara. O clique **duplo**,
   * em que as duas requisições passam por aqui antes de qualquer uma gravar,
   * quem barra é o índice único parcial do banco, tratado no `catch` adiante.
   */
  const [existente] = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(
      and(
        eq(oportunidades.clienteUsuarioId, sessao.id),
        eq(oportunidades.destinatarioId, prestadorId),
        eq(oportunidades.chaveIntencao, chaveIntencao),
        eq(oportunidades.status, 'aberta'),
      ),
    )
    .limit(1)

  if (existente) {
    return {
      sucesso: true as const,
      mensagem: `Você já demonstrou interesse com esta simulação. ${precificacao.primeiroNome} foi avisado.`,
      precisaEntrar: false,
      contaNaoConfirmada: false,
      dados: { oportunidadeId: existente.id, repetida: true },
    }
  }

  const titulo = resumirTexto(
    `Interesse na simulação de preços · ${formatarCentavos(precoMensalCentavos)}/mês`,
    160,
  )
  const descricao = descricaoDaSimulacao(simulacao, precificacao.primeiroNome)
  const prazoHoras = await obterPrazoOportunidadeHoras()
  const oportunidadeId = randomUUID()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(oportunidades).values({
        id: oportunidadeId,
        clienteUsuarioId: sessao.id,
        categoria,
        titulo,
        descricao,
        // A simulação não pergunta onde a empresa fica, e inventar uma UF seria
        // afirmar algo que ninguém respondeu.
        abrangencia: 'BR',
        // O preço simulado **não** vai para `valor_pretendido_centavos`: aquela
        // coluna é o que o cliente diz que pretende investir, e ele não disse
        // nada. O que ele viu está no retrato, com o nome certo.
        valorPretendidoCentavos: null,
        expiraEm: new Date(Date.now() + prazoHoras * 60 * 60 * 1000),
        visibilidade: 'privada',
        destinatarioId: destinatario.id,
        origem: 'simulacao_preco',
        simulacao,
        chaveIntencao,
      })

      await difundirOportunidadeDireta(
        tx,
        { id: oportunidadeId, categoria, titulo, abrangencia: 'BR' },
        destinatario.id,
      )

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.oportunidadeCriada,
          entidade: 'oportunidades',
          registroAfetado: oportunidadeId,
          autorId: sessao.id,
          usuarioId: sessao.id,
          origem: 'admin',
          metadados: {
            categoria,
            visibilidade: 'privada',
            destinatarioId: destinatario.id,
            origemDaOportunidade: 'simulacao_preco',
            precoSimuladoCentavos: precoMensalCentavos,
          },
        },
        tx,
      )
    })
  } catch (error) {
    // O índice único parcial é o que sobrevive ao clique duplo. Quando ele
    // dispara, a intenção já existe — devolver a que ganhou a corrida é o
    // resultado correto, e não um erro.
    const [gravada] = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(
        and(
          eq(oportunidades.clienteUsuarioId, sessao.id),
          eq(oportunidades.destinatarioId, prestadorId),
          eq(oportunidades.chaveIntencao, chaveIntencao),
          eq(oportunidades.status, 'aberta'),
        ),
      )
      .limit(1)

    if (gravada) {
      return {
        sucesso: true as const,
        mensagem: `Interesse enviado para ${precificacao.primeiroNome}.`,
        precisaEntrar: false,
        contaNaoConfirmada: false,
        dados: { oportunidadeId: gravada.id, repetida: true },
      }
    }

    console.error('[INTERESSE_SIMULACAO]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return recusa(
      'Não foi possível enviar seu interesse agora. Tente novamente.',
    )
  }

  // Depois do commit, como no resto do módulo: quem receber e recarregar
  // encontra a solicitação pronta para ler.
  await avisarEmTempoReal({
    destinatarios: [destinatario.id],
    titulo: 'Um cliente demonstrou interesse na sua simulação de preços',
    oportunidadeId,
  })

  revalidatePath('/cliente')
  revalidatePath('/admin')

  return {
    sucesso: true as const,
    mensagem: `Interesse enviado para ${precificacao.primeiroNome}. Ele vai receber sua simulação e responder por aqui.`,
    precisaEntrar: false,
    contaNaoConfirmada: false,
    dados: { oportunidadeId, repetida: false },
  }
}

/**
 * A descrição que o Profissional lê primeiro.
 *
 * Escrita a partir do retrato, e não de um texto do cliente: nesta porta ele não
 * digitou nada — respondeu perguntas. A última linha existe para que ninguém
 * leia isto como pedido fechado.
 */
function descricaoDaSimulacao(
  simulacao: { itens: { rotulo: string; valor: string }[] },
  primeiroNome: string,
) {
  const linhas = simulacao.itens.map(
    (item) => `${item.rotulo}: ${item.valor}`,
  )
  return [
    `Este cliente simulou o preço na sua página e quer conversar com ${primeiroNome}.`,
    '',
    ...linhas,
    '',
    'Demonstração de interesse — ainda não é contratação. O combinado final é entre vocês.',
  ].join('\n')
}
