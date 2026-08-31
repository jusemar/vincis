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
import { violacoesComerciais } from '../lib/invariantes'
import { impressaoDaSecao, type SecaoPrecificacao } from '../lib/impressao'
import {
  EVENTOS_PRECIFICACAO,
  registrarAviso,
  registrarFalha,
  registrarInfo,
} from '../lib/registro'
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

/**
 * O que a tela recebe de volta.
 *
 * `secao` e `campo` existem para que o formulário consiga apontar onde está o
 * problema em vez de mostrar um aviso solto. `conflito` distingue "os valores
 * mudaram debaixo de você" de "estes valores não podem ser gravados": a
 * primeira pede recarregar, a segunda pede corrigir — e nenhuma das duas
 * apaga o rascunho.
 */
type Resultado = {
  sucesso: boolean
  mensagem: string
  secao?: string
  campo?: string
  conflito?: boolean
}

const NAO_AUTORIZADO: Resultado = {
  sucesso: false,
  mensagem: 'Operação não autorizada.',
}

const CONFLITO: Resultado = {
  sucesso: false,
  conflito: true,
  mensagem:
    'Estes valores foram alterados em outra sessão. Recarregue a página para ver a configuração atual antes de salvar — o que você digitou continua aqui.',
}

/** Só números e nomes de seção viram log — nunca o conteúdo dos campos. */
function contarResumo(resumo: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(resumo).filter(
      ([, valor]) => typeof valor === 'number' || typeof valor === 'string',
    ),
  ) as Record<string, string | number>
}

/** Rotas que precisam refletir o novo preço na próxima visita. */
function propagar() {
  revalidatePath('/precos')
  revalidatePath('/admin/precificacao')
}

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A gravação apontou para uma linha que não existe.
 *
 * `UPDATE ... WHERE codigo = 'inventado'` não falha: ele simplesmente não
 * atinge ninguém, e a action responderia "salvo" sem ter salvo nada. Pior,
 * seria o jeito de descobrir por tentativa quais identificadores existem. Cada
 * gravação confere quantas linhas atingiu e levanta isto quando o alvo não
 * está na grade.
 */
class ConfiguracaoDesconhecida extends Error {
  readonly alvo: string

  constructor(alvo: string) {
    super(`Configuração desconhecida: ${alvo}`)
    this.name = 'ConfiguracaoDesconhecida'
    this.alvo = alvo
  }
}

/** Confere que a gravação atingiu a linha pretendida. */
function exigirLinha(atingidas: unknown[], alvo: string) {
  if (atingidas.length === 0) throw new ConfiguracaoDesconhecida(alvo)
}

/**
 * A recusa de uma gravação, levantada de dentro da transação.
 *
 * Aqui está a diferença entre recusar e desfazer: **devolver** um resultado de
 * dentro do callback encerra a transação normalmente, e o Postgres confirma
 * tudo o que já foi escrito. A conferência diria "não salvo" enquanto o preço
 * zerado já estava no banco. Só uma exceção faz o driver desfazer — então a
 * recusa viaja como exceção e volta a ser um resultado do lado de fora.
 */
class RecusaDaGravacao extends Error {
  readonly resultado: Resultado

  constructor(resultado: Resultado) {
    super(resultado.mensagem)
    this.name = 'RecusaDaGravacao'
    this.resultado = resultado
  }
}

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
      if (impressaoDaSecao(antes, secao) !== impressaoRecebida) {
        registrarAviso(EVENTOS_PRECIFICACAO.conflito, { secao })
        throw new RecusaDaGravacao(CONFLITO)
      }

      await gravar(tx)

      const depois = await obterTabelaPrecificacao(tx)

      // Duas conferências, e as duas antes do commit: a estrutura (falta um
      // preço-base, uma família de faixas com buraco) e o comércio (preço
      // zerado, desconto que anula a mensalidade, pacote acima da soma).
      // Qualquer uma delas reprovando desfaz a transação inteira — nunca
      // metade da alteração gravada.
      const problemas = problemasDaTabela(depois)
      if (problemas.length > 0) {
        registrarAviso(EVENTOS_PRECIFICACAO.validar, {
          secao,
          etapa: 'coerencia',
          problema: problemas[0],
        })
        throw new RecusaDaGravacao({
          sucesso: false,
          secao,
          mensagem: `Não foi possível salvar: a configuração ficaria inconsistente. ${problemas[0]}`,
        })
      }

      const violacoes = violacoesComerciais(depois)
      if (violacoes.length > 0) {
        const primeira = violacoes[0]
        registrarAviso(EVENTOS_PRECIFICACAO.validar, {
          secao,
          etapa: 'invariantes',
          violacao: primeira.mensagem,
          total: violacoes.length,
        })
        throw new RecusaDaGravacao({
          sucesso: false,
          secao: primeira.secao,
          campo: primeira.campo,
          mensagem: `Não foi possível salvar. ${primeira.mensagem}`,
        })
      }

      // A trilha guarda o antes e o depois da própria seção, e não só o que
      // foi mexido: preço é a coisa que mais precisa poder ser reconstituída
      // depois. São duas strings curtas — a mesma impressão que já servia
      // para detectar conflito.
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.precificacaoAlterada,
          entidade: 'precificacao',
          autorId: gestor.id,
          origem: 'gestao_vincis',
          metadados: {
            secao,
            ...resumo,
            antes: impressaoDaSecao(antes, secao),
            depois: impressaoDaSecao(depois, secao),
          },
        },
        tx,
      )

      registrarInfo(EVENTOS_PRECIFICACAO.salvar, { secao, ...contarResumo(resumo) })
      return { sucesso: true, mensagem: 'Alterações salvas.' }
    })

    if (resultado.sucesso) propagar()
    return resultado
  } catch (erro) {
    // Uma recusa nossa, um `check` do banco ou o banco fora do ar caem todos
    // aqui — e em qualquer um dos casos a transação já foi desfeita, porque foi
    // a exceção que a desfez. O que falta é traduzir cada um para uma frase que
    // o Gestor entenda, sem devolver a mensagem crua do Postgres para a tela.
    if (erro instanceof RecusaDaGravacao) return erro.resultado

    if (erro instanceof ConfiguracaoDesconhecida) {
      registrarAviso(EVENTOS_PRECIFICACAO.validar, {
        secao,
        etapa: 'alvo_inexistente',
        alvo: erro.alvo,
      })
      return {
        sucesso: false,
        secao,
        mensagem:
          'Não foi possível salvar: um dos campos enviados não existe mais nesta configuração. Recarregue a página e tente de novo.',
      }
    }

    registrarFalha(EVENTOS_PRECIFICACAO.salvar, { secao }, erro)
    return {
      sucesso: false,
      secao,
      mensagem:
        'Não foi possível salvar agora. Confira os valores e tente novamente em instantes.',
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
        const atingidas = await tx
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
          .returning({ regime: precificacaoPrecosBase.regime })
        exigirLinha(atingidas, `preço ${preco.grupo}/${preco.regime}`)
      }

      const servico = await tx
        .update(precificacaoServicos)
        .set({
          multiplicadorMilesimos:
            percentualParaMultiplicador(acrescimoConsultiva),
          updatedAt: new Date(),
        })
        .where(eq(precificacaoServicos.codigo, 'consultiva'))
        .returning({ codigo: precificacaoServicos.codigo })
      exigirLinha(servico, 'serviço consultiva')
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
        const atingidas = await tx
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
          .returning({ codigo: precificacaoFaixas.codigo })
        exigirLinha(atingidas, `faixa ${tipo}/${faixa.grupo}/${faixa.codigo}`)
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
        const atingidas = await tx
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
          .returning({ codigo: precificacaoOpcoes.codigo })
        exigirLinha(atingidas, `opção ${dimensao}/${opcao.codigo}`)
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
        const atingidas = await tx
          .update(precificacaoAdicionais)
          .set({
            valorMensalCentavos: reaisParaCentavos(adicional.valorReais),
            ativo: adicional.ativo,
            updatedAt: new Date(),
          })
          .where(eq(precificacaoAdicionais.codigo, adicional.codigo))
          .returning({ codigo: precificacaoAdicionais.codigo })
        exigirLinha(atingidas, `adicional ${adicional.codigo}`)
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
        const atingidas = await tx
          .update(precificacaoDescontos)
          .set({
            descontoMilesimos: percentualParaDesconto(desconto.percentual),
            updatedAt: new Date(),
          })
          .where(eq(precificacaoDescontos.codigo, desconto.codigo))
          .returning({ codigo: precificacaoDescontos.codigo })
        exigirLinha(atingidas, `desconto ${desconto.codigo}`)
      }
    },
  })
}
