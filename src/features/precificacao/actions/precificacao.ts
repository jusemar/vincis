'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  precificacaoAdicionais,
  precificacaoDescontos,
  precificacaoFaixas,
  precificacaoOpcoes,
  precificacaoPrecosBase,
  precificacaoServicos,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import { problemasDaTabela } from '../lib/coerencia'
import { impressaoDaSecao, type SecaoPrecificacao } from '../lib/impressao'
import {
  percentualParaDesconto,
  percentualParaMultiplicador,
  reaisParaCentavos,
} from '../lib/conversao'
import {
  AdicionaisSchema,
  DescontosSchema,
  FaixasValoresSchema,
  FatoresSchema,
  PrecosBaseSchema,
} from '../schemas/administracao'
import { obterTabelaPrecificacao } from '../queries/obter-tabela-precificacao'

/**
 * O que o Gestor da Plataforma pode mudar na precificação.
 *
 * ## Toda action passa pelas mesmas três portas
 *
 * 1. **Quem é** — `validarGestorVincis()` relê sessão e perfil no banco. A
 *    rota já é barrada pelo middleware e pelo layout, e nenhuma das duas coisas
 *    protege quem chama a action direto; esta conferência é que fecha.
 * 2. **O que veio** — Zod, nas unidades da tela (reais e porcentagem).
 * 3. **O que sobra** — dentro da transação, a tabela inteira é relida e passa
 *    por `problemasDaTabela`. Uma configuração que faria `/precos` parar de
 *    calcular não chega a ser confirmada: a transação desfaz.
 *
 * ## Por seção, e não tudo de uma vez
 *
 * Cada bloco da tela salva o próprio conjunto. Um formulário único com a
 * precificação inteira transformaria um erro de digitação num percentual em
 * perda de tudo o que foi ajustado nas outras seções — e faria a tela
 * reescrever, a cada salvamento, linhas que ninguém tocou.
 */

type Resultado = { sucesso: boolean; mensagem: string }

const NAO_AUTORIZADO: Resultado = {
  sucesso: false,
  mensagem: 'Operação não autorizada.',
}

const CONFLITO: Resultado = {
  sucesso: false,
  mensagem:
    'Estes valores foram alterados em outra sessão. Recarregue a página para ver a configuração atual antes de salvar.',
}

/** Rotas que precisam refletir o novo preço na próxima visita. */
function propagar() {
  revalidatePath('/precos')
  revalidatePath('/admin/precificacao')
}

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Quem está pedindo — conferido **antes** de olhar o que veio no corpo.
 *
 * A ordem importa: validar o formulário primeiro faria a plataforma responder
 * "informe uma porcentagem" a quem nem deveria saber que existe um campo de
 * porcentagem. Não autorizado é não autorizado, e é só isso que sai daqui.
 */
async function autorizar() {
  return validarGestorVincis()
}

/**
 * A parte que toda seção repete: abrir transação, conferir a impressão,
 * gravar, revalidar a tabela inteira e auditar.
 */
async function salvarSecao({
  gestor,
  secao,
  impressaoRecebida,
  gravar,
  resumo,
}: {
  gestor: { id: string }
  secao: SecaoPrecificacao
  impressaoRecebida: string
  gravar: (tx: Transacao) => Promise<void>
  resumo: Record<string, unknown>
}): Promise<Resultado> {
  try {
    const resultado = await db.transaction(async (tx) => {
      const antes = await obterTabelaPrecificacao(tx)
      if (impressaoDaSecao(antes, secao) !== impressaoRecebida) return CONFLITO

      await gravar(tx)

      const depois = await obterTabelaPrecificacao(tx)
      const problemas = problemasDaTabela(depois)
      if (problemas.length > 0) {
        return {
          sucesso: false,
          mensagem: `A configuração ficaria inconsistente: ${problemas[0]}`,
        }
      }

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.precificacaoAlterada,
          entidade: 'precificacao',
          autorId: gestor.id,
          origem: 'gestao_vincis',
          metadados: { secao, ...resumo },
        },
        tx,
      )

      return { sucesso: true, mensagem: 'Alterações salvas.' }
    })

    if (resultado.sucesso) propagar()
    return resultado
  } catch (erro) {
    // Um `check` do banco recusando um valor impossível cai aqui. A transação
    // já desfez tudo; o que falta é não devolver a mensagem crua do Postgres.
    console.error('Falha ao salvar precificação', { secao, erro })
    return {
      sucesso: false,
      mensagem: 'Não foi possível salvar. Confira os valores e tente novamente.',
    }
  }
}

/** Preços-base por regime e o acréscimo da Contabilidade Consultiva. */
export async function salvarPrecosBase(entrada: unknown): Promise<Resultado> {
  const gestor = await autorizar()
  if (!gestor) return NAO_AUTORIZADO

  const validacao = PrecosBaseSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }
  const { impressao, precos, acrescimoConsultiva } = validacao.data

  return salvarSecao({
    gestor,
    secao: 'precos_base',
    impressaoRecebida: impressao,
    resumo: { precos: precos.length, acrescimoConsultiva },
    gravar: async (tx) => {
      for (const preco of precos) {
        await tx
          .update(precificacaoPrecosBase)
          .set({
            valorCentavos: reaisParaCentavos(preco.valorReais),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(precificacaoPrecosBase.grupo, preco.grupo),
              eq(precificacaoPrecosBase.regime, preco.regime),
            ),
          )
      }

      await tx
        .update(precificacaoServicos)
        .set({
          multiplicadorMilesimos:
            percentualParaMultiplicador(acrescimoConsultiva),
          updatedAt: new Date(),
        })
        .where(eq(precificacaoServicos.codigo, 'consultiva'))
    },
  })
}

/** Valores das faixas de funcionários, notas fiscais ou faturamento. */
export async function salvarFaixas(entrada: unknown): Promise<Resultado> {
  const gestor = await autorizar()
  if (!gestor) return NAO_AUTORIZADO

  const validacao = FaixasValoresSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }
  const { impressao, tipo, faixas } = validacao.data

  return salvarSecao({
    gestor,
    secao: tipo,
    impressaoRecebida: impressao,
    resumo: { tipo, faixas: faixas.length },
    gravar: async (tx) => {
      for (const faixa of faixas) {
        await tx
          .update(precificacaoFaixas)
          .set({
            valorCentavos: reaisParaCentavos(faixa.valorReais),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(precificacaoFaixas.grupo, faixa.grupo),
              eq(precificacaoFaixas.tipo, tipo),
              eq(precificacaoFaixas.codigo, faixa.codigo),
            ),
          )
      }
    },
  })
}

/** Acréscimos de ramo, atendimento ou rotina. */
export async function salvarFatores(entrada: unknown): Promise<Resultado> {
  const gestor = await autorizar()
  if (!gestor) return NAO_AUTORIZADO

  const validacao = FatoresSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }
  const { impressao, dimensao, opcoes } = validacao.data

  return salvarSecao({
    gestor,
    secao: `fatores:${dimensao}`,
    impressaoRecebida: impressao,
    resumo: { dimensao, opcoes: opcoes.length },
    gravar: async (tx) => {
      for (const opcao of opcoes) {
        await tx
          .update(precificacaoOpcoes)
          .set({
            multiplicadorMilesimos: percentualParaMultiplicador(
              opcao.acrescimoPercentual,
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(precificacaoOpcoes.dimensaoCodigo, dimensao),
              eq(precificacaoOpcoes.codigo, opcao.codigo),
            ),
          )
      }
    },
  })
}

/** Valor mensal e disponibilidade dos serviços adicionais. */
export async function salvarAdicionais(entrada: unknown): Promise<Resultado> {
  const gestor = await autorizar()
  if (!gestor) return NAO_AUTORIZADO

  const validacao = AdicionaisSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }
  const { impressao, adicionais } = validacao.data

  return salvarSecao({
    gestor,
    secao: 'adicionais',
    impressaoRecebida: impressao,
    resumo: { adicionais: adicionais.length },
    gravar: async (tx) => {
      for (const adicional of adicionais) {
        await tx
          .update(precificacaoAdicionais)
          .set({
            valorMensalCentavos: reaisParaCentavos(adicional.valorReais),
            ativo: adicional.ativo,
            updatedAt: new Date(),
          })
          .where(eq(precificacaoAdicionais.codigo, adicional.codigo))
      }
    },
  })
}

/** Descontos de prazo e do Pacote Empresarial Completo. */
export async function salvarDescontos(entrada: unknown): Promise<Resultado> {
  const gestor = await autorizar()
  if (!gestor) return NAO_AUTORIZADO

  const validacao = DescontosSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }
  const { impressao, descontos } = validacao.data

  return salvarSecao({
    gestor,
    secao: 'descontos',
    impressaoRecebida: impressao,
    resumo: { descontos: descontos.length },
    gravar: async (tx) => {
      for (const desconto of descontos) {
        await tx
          .update(precificacaoDescontos)
          .set({
            descontoMilesimos: percentualParaDesconto(desconto.percentual),
            updatedAt: new Date(),
          })
          .where(eq(precificacaoDescontos.codigo, desconto.codigo))
      }
    },
  })
}
