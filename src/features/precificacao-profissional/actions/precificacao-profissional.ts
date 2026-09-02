'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  precificacaoProfissional,
  precificacaoProfissionalValores,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  percentualParaMultiplicador,
  reaisParaCentavos,
} from '@/features/precificacao/lib/conversao'
import {
  EVENTOS_PRECIFICACAO,
  registrarAviso,
  registrarFalha,
  registrarInfo,
} from '@/features/precificacao/lib/registro'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import { ROTA_MEUS_PRECOS } from '../constants/precificacao-profissional'
import { autorizarPrestador } from '../lib/autorizar-prestador'
import { conferirValoresDoProfissional } from '../lib/conferencia'
import { impressaoDosValores, linhasDosValores } from '../lib/grade'
import {
  PublicarSchema,
  SalvarRascunhoSchema,
  type ValoresDoProfissionalEntrada,
} from '../schemas/precificacao-profissional'
import type {
  EstadoDaConfiguracao,
  ResultadoDaGravacao,
  ValoresDoProfissional,
} from '../types/precificacao-profissional'

/**
 * O que o Profissional pode mudar na própria tabela de preços.
 *
 * ## Três portas, na mesma ordem de sempre
 *
 * 1. **Quem é** — `autorizarPrestador()` relê sessão e cadastro no banco, e o
 *    dono dos valores é a conta que ela devolve. Nenhuma action recebe um
 *    identificador de profissional: não existe o parâmetro que permitiria pedir
 *    a tabela de outra pessoa.
 * 2. **O que veio** — Zod, nas unidades da tela (reais e porcentagem).
 * 3. **O que sobra** — a grade precisa estar completa e o preço precisa passar
 *    por `violacoesComerciais`, o **mesmo** conferidor comercial da
 *    precificação da Vincis, rodando o motor de verdade. Uma tabela que
 *    chegaria a R$ 0 para alguma empresa não é gravada.
 *
 * ## Estas actions não alcançam a precificação da Vincis
 *
 * Elas escrevem em duas tabelas, `precificacao_profissional` e
 * `precificacao_profissional_valores`, ambas chaveadas pela conta da sessão.
 * `precificacao_*` — a grade oficial — não é importada aqui nem para leitura de
 * escrita: dela vem só a estrutura, por uma consulta de leitura. Não há caminho
 * de código, com ou sem parâmetro forjado, que faça uma destas funções alterar
 * o preço da Vincis ou o de outro Profissional.
 *
 * ## Salvar não é publicar
 *
 * `salvarRascunhoDePrecos` grava o estado `rascunho` e não toca no que está no
 * ar — quem já publicou continua com o preço anterior na página pública até
 * apertar Publicar. É a mesma separação que a prévia da tela representa
 * visualmente, só que persistida.
 */

const NAO_AUTORIZADO: ResultadoDaGravacao = {
  sucesso: false,
  mensagem: 'Operação não autorizada.',
}

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Reais e porcentagem viram centavos e milésimos numa borda só. */
function valoresDaEntrada(
  entrada: ValoresDoProfissionalEntrada,
): ValoresDoProfissional {
  return {
    precosBase: Object.fromEntries(
      entrada.precosBase.map((p) => [p.chave, reaisParaCentavos(p.valorReais)]),
    ),
    faixas: Object.fromEntries(
      entrada.faixas.map((f) => [f.chave, reaisParaCentavos(f.valorReais)]),
    ),
    fatores: Object.fromEntries(
      entrada.fatores.map((f) => [
        f.chave,
        percentualParaMultiplicador(f.acrescimoPercentual),
      ]),
    ),
  }
}

/**
 * Grava um conjunto inteiro, substituindo o anterior.
 *
 * Apagar e reinserir, e não `UPDATE` linha a linha: o conjunto é a unidade que
 * faz sentido: um `UPDATE` parcial deixaria para trás a linha de uma faixa que
 * saiu da grade, e ela voltaria a ser somada no dia em que a Vincis reintroduzisse
 * o código. Dentro da transação, a substituição é atômica.
 */
async function gravarConjunto(
  tx: Transacao,
  profissionalId: string,
  estado: EstadoDaConfiguracao,
  valores: ValoresDoProfissional,
) {
  await tx
    .delete(precificacaoProfissionalValores)
    .where(
      and(
        eq(precificacaoProfissionalValores.profissionalId, profissionalId),
        eq(precificacaoProfissionalValores.estado, estado),
      ),
    )

  const linhas = linhasDosValores(valores).map((linha) => ({
    profissionalId,
    estado,
    tipo: linha.tipo,
    chave: linha.chave,
    valor: linha.valor,
    updatedAt: new Date(),
  }))

  if (linhas.length > 0) {
    await tx.insert(precificacaoProfissionalValores).values(linhas)
  }
}

/** Garante o cabeçalho da configuração, sem mexer no estado de publicação. */
async function garantirCabecalho(tx: Transacao, profissionalId: string) {
  await tx
    .insert(precificacaoProfissional)
    .values({ profissionalId })
    .onConflictDoNothing({ target: precificacaoProfissional.profissionalId })
}

/**
 * O caminho comum de `salvar` e `publicar`.
 *
 * Os dois validam a mesma coisa, e é de propósito: publicar não é a primeira
 * vez que os números são conferidos, é a segunda. Guardar um rascunho
 * impublicável seria guardar um problema para o momento em que a pessoa menos
 * quer encontrá-lo.
 */
async function gravar({
  entrada,
  publicar,
}: {
  entrada: unknown
  publicar: boolean
}): Promise<ResultadoDaGravacao> {
  const prestador = await autorizarPrestador()
  if (!prestador) return NAO_AUTORIZADO

  const esquema = publicar ? PublicarSchema : SalvarRascunhoSchema
  const validacao = esquema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: validacao.error.issues[0].message }
  }

  const valores = valoresDaEntrada(validacao.data.valores)

  try {
    const estrutura = await obterTabelaPrecificacao()
    const { problemas, violacoes } = conferirValoresDoProfissional(
      estrutura,
      valores,
    )

    if (problemas.length > 0) {
      registrarAviso(EVENTOS_PRECIFICACAO.validar, {
        escopo: 'precificacao_profissional',
        etapa: 'grade',
        problema: problemas[0],
      })
      return {
        sucesso: false,
        mensagem:
          'Não foi possível salvar: a tabela de preços mudou de formato. Recarregue a página e tente de novo.',
      }
    }

    if (violacoes.length > 0) {
      const primeira = violacoes[0]
      registrarAviso(EVENTOS_PRECIFICACAO.validar, {
        escopo: 'precificacao_profissional',
        etapa: 'invariantes',
        violacao: primeira.mensagem,
        total: violacoes.length,
      })
      return {
        sucesso: false,
        secao: primeira.secao,
        campo: primeira.campo,
        mensagem: `Não foi possível salvar. ${primeira.mensagem}`,
      }
    }

    await db.transaction(async (tx) => {
      await garantirCabecalho(tx, prestador.id)
      await gravarConjunto(tx, prestador.id, 'rascunho', valores)

      if (publicar) {
        await gravarConjunto(tx, prestador.id, 'publicado', valores)
        await tx
          .update(precificacaoProfissional)
          .set({ publicado: true, publicadoEm: new Date(), updatedAt: new Date() })
          .where(eq(precificacaoProfissional.profissionalId, prestador.id))
      } else {
        await tx
          .update(precificacaoProfissional)
          .set({ updatedAt: new Date() })
          .where(eq(precificacaoProfissional.profissionalId, prestador.id))
      }

      await registrarEventoAuditoria(
        {
          acao: publicar
            ? ACOES_AUDITORIA.precificacaoProfissionalPublicada
            : ACOES_AUDITORIA.precificacaoProfissionalSalva,
          entidade: 'precificacao_profissional',
          registroAfetado: prestador.id,
          autorId: prestador.id,
          origem: 'admin',
          metadados: {
            publicado: publicar,
            // A impressão é o retrato dos números gravados: preço é o que mais
            // precisa poder ser reconstituído depois.
            valores: impressaoDosValores(valores),
          },
        },
        tx,
      )
    })

    registrarInfo(EVENTOS_PRECIFICACAO.salvar, {
      escopo: 'precificacao_profissional',
      publicado: publicar,
    })
    propagar()

    return {
      sucesso: true,
      mensagem: publicar
        ? 'Preços publicados. Seu perfil já mostra os valores atualizados.'
        : 'Rascunho salvo. Nada mudou na sua página pública ainda.',
    }
  } catch (erro) {
    registrarFalha(
      EVENTOS_PRECIFICACAO.salvar,
      { escopo: 'precificacao_profissional', publicado: publicar },
      erro,
    )
    return {
      sucesso: false,
      mensagem:
        'Não foi possível salvar agora. Confira os valores e tente novamente em instantes.',
    }
  }
}

/** Guarda o que está em edição. A página pública continua como estava. */
export async function salvarRascunhoDePrecos(
  entrada: unknown,
): Promise<ResultadoDaGravacao> {
  return gravar({ entrada, publicar: false })
}

/** Põe no ar exatamente os valores que estavam na prévia. */
export async function publicarPrecos(
  entrada: unknown,
): Promise<ResultadoDaGravacao> {
  return gravar({ entrada, publicar: true })
}

/**
 * Tira a tabela do ar sem apagar nada.
 *
 * O rascunho e a última versão publicada continuam gravados: despublicar é
 * fechar a porta, não jogar fora o trabalho. Republicar devolve a mesma tabela.
 */
export async function despublicarPrecos(): Promise<ResultadoDaGravacao> {
  const prestador = await autorizarPrestador()
  if (!prestador) return NAO_AUTORIZADO

  try {
    const atingidas = await db
      .update(precificacaoProfissional)
      .set({ publicado: false, updatedAt: new Date() })
      .where(eq(precificacaoProfissional.profissionalId, prestador.id))
      .returning({ id: precificacaoProfissional.profissionalId })

    if (atingidas.length === 0) {
      return {
        sucesso: false,
        mensagem: 'Você ainda não tem uma tabela de preços para tirar do ar.',
      }
    }

    await registrarEventoAuditoria({
      acao: ACOES_AUDITORIA.precificacaoProfissionalPublicada,
      entidade: 'precificacao_profissional',
      registroAfetado: prestador.id,
      autorId: prestador.id,
      origem: 'admin',
      metadados: { publicado: false },
    })

    registrarInfo(EVENTOS_PRECIFICACAO.salvar, {
      escopo: 'precificacao_profissional',
      publicado: false,
      acao: 'despublicar',
    })
    propagar()

    return {
      sucesso: true,
      mensagem: 'Seus preços saíram do ar. O perfil não mostra mais planos.',
    }
  } catch (erro) {
    registrarFalha(
      EVENTOS_PRECIFICACAO.salvar,
      { escopo: 'precificacao_profissional', acao: 'despublicar' },
      erro,
    )
    return {
      sucesso: false,
      mensagem: 'Não foi possível tirar do ar agora. Tente novamente em instantes.',
    }
  }
}

/**
 * O painel é a única rota estática a revalidar.
 *
 * O perfil público e a página de planos são renderizados por visita
 * (`force-dynamic`) porque dependem de `?prestador=`, e `revalidatePath` não
 * alcança um caminho com query. A publicação aparece na visita seguinte sem
 * ninguém precisar limpar cache.
 */
function propagar() {
  revalidatePath(ROTA_MEUS_PRECOS)
}
