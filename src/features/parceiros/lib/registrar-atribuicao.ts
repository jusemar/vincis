import { and, asc, eq, isNull } from 'drizzle-orm'
import type { db as Banco } from '@/db/connection'
import {
  parceiroAtribuicoes,
  parceiroEventos,
  parceiroIndicacoes,
  usuarios,
} from '@/db/schema'
import { calcularExpiracao } from '../constants/prazo'
import { gerarComissaoDaContratacao } from './registrar-comissao'
import { obterPrazoVigente } from '../queries/obter-prazo'
import { hashDoVisitante, tokenDeVisitanteValido } from './visitante'

/** A transação da oportunidade. Tipo do `tx` que o Drizzle entrega. */
type Transacao = Parameters<Parameters<typeof Banco.transaction>[0]>[0]

type IndicacaoVigente = {
  id: string
  parceiroId: string
  usuarioId: string | null
  resolvidaPor: 'cookie' | 'conta'
}

/**
 * De qual parceiro este cliente veio.
 *
 * A ordem é a regra: **quem já é da base Vincis não é captado de novo**.
 *
 * 1. **a conta**. Se esta pessoa já tem uma indicação ligada a ela, a origem
 *    dela está decidida e não muda mais. Clicar no link de Maria depois de ter
 *    nascido por João não transfere nada: o ciclo novo é registro técnico do
 *    navegador, não um novo direito de atribuição. Vale mesmo quando a
 *    atribuição anterior já expirou — expirar significa "esta indicação não
 *    vale mais para aquele serviço", nunca "o cliente voltou ao mercado";
 * 2. **o navegador**, só para quem ainda não tem origem nenhuma, e só quando o
 *    ciclo é anônimo e a conta nasceu **depois** dele. É a mesma barreira de
 *    data do cadastro: cliente que já era da Vincis antes do clique não vira
 *    indicação de ninguém. Na prática este caminho é o resgate de quem se
 *    cadastrou pelo link e teve a associação falhando no cadastro.
 *
 * O ciclo aberto que pertence a **outra** pessoa nunca é considerado: é o
 * computador compartilhado, e o cookie do escritório não pode fazer o negócio
 * de alguém nascer sob o ciclo de outro.
 */
async function resolverIndicacaoVigente(
  tx: Transacao,
  usuarioId: string,
  visitanteToken: string | undefined,
): Promise<IndicacaoVigente | null> {
  // A primeira indicação associada é a origem — não a mais recente. Se um dia
  // houver duas, a que vale é a que trouxe a pessoa para a base.
  const [daConta] = await tx
    .select({
      id: parceiroIndicacoes.id,
      parceiroId: parceiroIndicacoes.parceiroId,
      usuarioId: parceiroIndicacoes.usuarioId,
    })
    .from(parceiroIndicacoes)
    .where(eq(parceiroIndicacoes.usuarioId, usuarioId))
    .orderBy(asc(parceiroIndicacoes.createdAt))
    .limit(1)

  if (daConta) return { ...daConta, resolvidaPor: 'conta' }

  if (!tokenDeVisitanteValido(visitanteToken)) return null

  const [aberto] = await tx
    .select({
      id: parceiroIndicacoes.id,
      parceiroId: parceiroIndicacoes.parceiroId,
      usuarioId: parceiroIndicacoes.usuarioId,
      criadoEm: parceiroIndicacoes.createdAt,
    })
    .from(parceiroIndicacoes)
    .where(
      and(
        eq(parceiroIndicacoes.visitanteHash, hashDoVisitante(visitanteToken)),
        isNull(parceiroIndicacoes.substituidaEm),
      ),
    )
    .limit(1)

  if (!aberto || aberto.usuarioId !== null) return null

  const [conta] = await tx
    .select({ criadoEm: usuarios.createdAt })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)

  // Conta anterior ao ciclo: já era da base. Igualdade passa — é o cadastro
  // feito no mesmo instante do acesso, direto pelo formulário do link.
  if (!conta || conta.criadoEm < aberto.criadoEm) return null

  return {
    id: aberto.id,
    parceiroId: aberto.parceiroId,
    usuarioId: aberto.usuarioId,
    resolvidaPor: 'cookie',
  }
}

/**
 * O negócio que originou a atribuição.
 *
 * Uma das duas, nunca as duas: é a mesma regra que o `check` da tabela guarda.
 */
type Negocio = { oportunidadeId: string } | { contratacaoId: string }

/**
 * Registra de qual parceiro nasceu um negócio.
 *
 * ## Dentro da transação, sem poder derrubá-la
 *
 * Roda no mesmo `tx` da oportunidade — atribuição e negócio nascem juntos ou não
 * nascem —, mas dentro de um ponto de salvamento próprio. Um erro aqui desfaz
 * só o que é do programa de parceiros; a oportunidade segue e é gravada. Sem o
 * ponto de salvamento, qualquer falha marcaria a transação inteira como abortada
 * no Postgres, e um `try/catch` em JavaScript não a traria de volta: o Cliente
 * perderia a solicitação por causa de um módulo acessório.
 *
 * ## Idempotência
 *
 * `on conflict do nothing` no índice único de `oportunidade_id`. O evento no
 * histórico só é gravado quando a linha realmente nasceu — repetir a chamada não
 * produz uma segunda "demonstrou interesse" na mesma oportunidade.
 *
 * ## Sem parceiro, nada acontece
 *
 * A esmagadora maioria das oportunidades não vem de indicação nenhuma. Nesse
 * caso a função lê uma consulta e volta: nenhuma linha, nenhum evento, nenhuma
 * diferença no fluxo que já existia.
 *
 * ## O que ela **não** decide
 *
 * Nada de comissão. Registrar que João trouxe o cliente é um fato; se isso vira
 * dinheiro depende de prazo por serviço, nível e primeira contratação — regras
 * que ainda não existem e que não moram nesta tabela. O parceiro também não
 * escolheu o profissional: Carlos pode ter vindo de João e contratado Pedro, e
 * as duas coisas são verdade ao mesmo tempo.
 */
async function registrarAtribuicao(
  tx: Transacao,
  {
    negocio,
    usuarioId,
    visitanteToken,
    servico,
    evento,
    nome,
  }: {
    /** De qual negócio real nasceu — oportunidade ou contratação direta. */
    negocio: Negocio
    /** Cliente, sempre da sessão. */
    usuarioId: string
    /** Valor cru do cookie do visitante, quando o navegador o trouxe. */
    visitanteToken: string | undefined
    /** Categoria do negócio, no vocabulário da taxonomia. */
    servico: string | null
    /**
     * O fato que aconteceu, no vocabulário do histórico.
     *
     * `contratou_servico` só quando existe contratação efetiva. Oportunidade e
     * pedido de orçamento são interesse: anunciar como fechado um negócio que
     * ainda depende de proposta seria registrar um fato que não ocorreu.
     */
    evento: 'demonstrou_interesse' | 'contratou_servico'
    /** Nome congelado do serviço, quando o negócio já tem um. */
    nome?: string | null
  },
): Promise<{ parceiroId: string; prazoDias: number } | null> {
  try {
    return await tx.transaction(async (interna) => {
      const indicacao = await resolverIndicacaoVigente(
        interna,
        usuarioId,
        visitanteToken,
      )
      if (!indicacao) return null

      /*
        O ciclo anônimo deste navegador passa a apontar para a conta.

        Só acontece quando a pessoa ainda não tinha origem nenhuma e o ciclo
        passou na barreira de data — quem já é da base nunca chega aqui. É elo
        de identidade, não captação: quem diz que uma conta nasceu de uma
        indicação é o evento `cadastrou_conta`, gravado só no cadastro. A partir
        daqui a origem é da conta e não muda mais, nem por clique novo.
      */
      if (indicacao.usuarioId === null) {
        await interna
          .update(parceiroIndicacoes)
          .set({ usuarioId, updatedAt: new Date() })
          .where(
            and(
              eq(parceiroIndicacoes.id, indicacao.id),
              isNull(parceiroIndicacoes.usuarioId),
            ),
          )
      }

      /*
        O prazo é lido agora e copiado para a linha — nunca consultado de novo.

        É o mesmo princípio de `oportunidades.expira_em`: se a Gestão trocar 60
        por 90 amanhã, esta atribuição continua valendo 60, porque foi sob 60
        que ela nasceu. Recalcular na leitura mudaria retroativamente o direito
        de alguém, e a leitura é tolerante justamente para que uma configuração
        corrompida não derrube a criação da oportunidade.
      */
      const prazo = await obterPrazoVigente(servico, interna)
      const inicio = new Date()

      const [criada] = await interna
        .insert(parceiroAtribuicoes)
        .values({
          indicacaoId: indicacao.id,
          parceiroId: indicacao.parceiroId,
          usuarioId,
          ...negocio,
          resolvidaPor: indicacao.resolvidaPor,
          servicoReferencia: servico,
          prazoDias: prazo.dias,
          expiraEm: calcularExpiracao(inicio, prazo.dias),
        })
        .onConflictDoNothing({
          target:
            'oportunidadeId' in negocio
              ? parceiroAtribuicoes.oportunidadeId
              : parceiroAtribuicoes.contratacaoId,
        })
        .returning({ id: parceiroAtribuicoes.id })

      // Já havia atribuição para esta oportunidade: nada novo aconteceu.
      if (!criada) return null

      /*
        O evento nasce junto com a linha, e só quando ela nasce.

        `criada` acima já garantiu que este é o primeiro registro deste negócio
        — o índice único da origem é quem barra o segundo. Por isso não há
        evento duplicado em retry ou reload, e nenhuma trava nova foi precisa.
      */
      await interna.insert(parceiroEventos).values({
        indicacaoId: indicacao.id,
        tipo: evento,
        // O prazo entra no histórico junto com o fato: quem ler daqui a um ano
        // precisa saber sob qual regra aquela indicação nasceu. O nome vai
        // junto para o histórico não depender de alcançar outro domínio.
        dados: {
          servico,
          nome: nome ?? null,
          prazoDias: prazo.dias,
          origemDoPrazo: prazo.origem,
        },
      })

      /*
        Contratação efetiva gera o direito à comissão, no mesmo instante.

        Dentro do mesmo ponto de salvamento: ou o negócio do parceiro nasce
        inteiro — atribuição, evento e comissão —, ou não nasce nada dele, e a
        contratação do cliente segue intacta de qualquer forma. Só aqui, porque
        só aqui existe contratação fechada: interesse não gera comissão.
      */
      if (evento === 'contratou_servico' && 'contratacaoId' in negocio) {
        await gerarComissaoDaContratacao(interna, {
          parceiroId: indicacao.parceiroId,
          atribuicaoId: criada.id,
          contratacaoId: negocio.contratacaoId,
          servico,
        })
      }

      return { parceiroId: indicacao.parceiroId, prazoDias: prazo.dias }
    })
  } catch (erro) {
    console.error('[PARCEIROS] falha ao registrar atribuição do negócio', {
      ...negocio,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return null
  }
}

/** A atribuição de um negócio que nasceu de uma oportunidade. */
export async function registrarAtribuicaoDaOportunidade(
  tx: Transacao,
  entrada: {
    oportunidadeId: string
    usuarioId: string
    visitanteToken: string | undefined
    servico: string | null
  },
) {
  const { oportunidadeId, ...resto } = entrada
  return registrarAtribuicao(tx, {
    ...resto,
    negocio: { oportunidadeId },
    // Oportunidade é intenção declarada, nunca contratação fechada.
    evento: 'demonstrou_interesse',
  })
}

/**
 * A atribuição de um negócio contratado direto do catálogo.
 *
 * O `servico` aqui não é a categoria do serviço como o catálogo a escreve: é a
 * referência de prazo equivalente, porque é nesse vocabulário que a Gestão
 * configura os prazos. Ver `referenciaDePrazoDaCategoria`.
 */
export async function registrarAtribuicaoDaContratacao(
  tx: Transacao,
  entrada: {
    contratacaoId: string
    usuarioId: string
    visitanteToken: string | undefined
    servico: string | null
    /** Nome congelado do serviço contratado. */
    nome?: string | null
    /**
     * Contratação fechada, e não pedido de orçamento.
     *
     * `aguardando_orcamento` ainda depende de uma proposta do profissional:
     * é interesse, e o histórico registra como tal.
     */
    efetivada: boolean
  },
) {
  const { contratacaoId, efetivada, ...resto } = entrada
  return registrarAtribuicao(tx, {
    ...resto,
    negocio: { contratacaoId },
    evento: efetivada ? 'contratou_servico' : 'demonstrou_interesse',
  })
}
