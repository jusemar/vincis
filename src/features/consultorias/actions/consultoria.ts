'use server'

import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  consultoriaConfiguracoes,
  consultoriaDisponibilidades,
  consultoriaExcecoes,
} from '@/db/schema'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import type { ModalidadeConsultoria, TipoExcecao } from '../constants/consultoria'
import { horaParaColuna } from '../lib/tempo'
import {
  ConsultoriaConfiguracaoSchema,
  ExcecaoIdSchema,
  ExcecaoSchema,
  FaixasSemanaisSchema,
} from '../schemas/consultoria'
import type { ConsultoriaDoPrestadorDTO } from '../types/consultoria'

/**
 * Configuração da Consultoria Agendada pelo próprio Profissional.
 *
 * A porta é `obterPrestadorSessao` — a mesma do catálogo de serviços e da
 * carteira de clientes. O dono da consultoria é **sempre** o usuário da sessão:
 * nenhuma destas funções aceita um `prestadorId` vindo da requisição, o que
 * torna o isolamento entre prestadores uma consequência da estrutura e não uma
 * checagem que alguém possa esquecer de escrever.
 *
 * Nesta etapa existe só a camada de servidor. A tela de agenda do `/admin` vem
 * depois; estas funções são o que ela vai chamar, e o que os testes já exercem.
 */

function primeiraMensagem(erro: { issues: { message: string }[] }) {
  return erro.issues[0]?.message ?? 'Revise os dados.'
}

/** A configuração do prestador da sessão, com faixas e exceções. */
export async function obterMinhaConsultoria(): Promise<
  | { sucesso: true; dados: ConsultoriaDoPrestadorDTO | null }
  | { sucesso: false; mensagem: string; dados: null }
> {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return { ...SEM_AUTORIZACAO, dados: null }

  const [configuracao] = await db
    .select()
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, prestador.usuarioId))
    .limit(1)

  if (!configuracao) return { sucesso: true as const, dados: null }

  const [faixas, excecoes] = await Promise.all([
    db
      .select({
        id: consultoriaDisponibilidades.id,
        diaSemana: consultoriaDisponibilidades.diaSemana,
        horaInicio: consultoriaDisponibilidades.horaInicio,
        horaFim: consultoriaDisponibilidades.horaFim,
      })
      .from(consultoriaDisponibilidades)
      .where(
        and(
          eq(consultoriaDisponibilidades.configuracaoId, configuracao.id),
          eq(consultoriaDisponibilidades.ativo, true),
        ),
      )
      .orderBy(
        asc(consultoriaDisponibilidades.diaSemana),
        asc(consultoriaDisponibilidades.horaInicio),
      ),
    db
      .select({
        id: consultoriaExcecoes.id,
        data: consultoriaExcecoes.data,
        tipo: consultoriaExcecoes.tipo,
        horaInicio: consultoriaExcecoes.horaInicio,
        horaFim: consultoriaExcecoes.horaFim,
        // O motivo só existe aqui: é anotação interna e nunca acompanha a
        // agenda pública.
        motivo: consultoriaExcecoes.motivo,
      })
      .from(consultoriaExcecoes)
      .where(
        and(
          eq(consultoriaExcecoes.configuracaoId, configuracao.id),
          eq(consultoriaExcecoes.ativo, true),
        ),
      )
      .orderBy(asc(consultoriaExcecoes.data)),
  ])

  return {
    sucesso: true as const,
    dados: {
      id: configuracao.id,
      prestadorId: configuracao.prestadorId,
      titulo: configuracao.titulo,
      descricaoCurta: configuracao.descricaoCurta,
      modalidade: configuracao.modalidade as ModalidadeConsultoria,
      valorCentavos: configuracao.valorCentavos,
      duracaoMinutos: configuracao.duracaoMinutos,
      intervaloMinutos: configuracao.intervaloMinutos,
      antecedenciaMinimaMinutos: configuracao.antecedenciaMinimaMinutos,
      horizonteDias: configuracao.horizonteDias,
      timezone: configuracao.timezone,
      ativa: configuracao.ativa,
      faixas,
      excecoes: excecoes.map((excecao) => ({
        ...excecao,
        tipo: excecao.tipo as TipoExcecao,
      })),
    },
  }
}

/**
 * Cria ou atualiza a consultoria padrão.
 *
 * `onConflictDoUpdate` no índice único de `prestador_id`: é o próprio banco que
 * garante "uma por Profissional", inclusive contra dois envios simultâneos do
 * mesmo formulário. Um `select` seguido de `insert` perderia essa corrida.
 */
export async function salvarConsultoria(entrada: unknown) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = ConsultoriaConfiguracaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) }
  }

  const valores = validacao.data
  const [salva] = await db
    .insert(consultoriaConfiguracoes)
    .values({ prestadorId: prestador.usuarioId, ...valores })
    .onConflictDoUpdate({
      target: consultoriaConfiguracoes.prestadorId,
      set: { ...valores, updatedAt: new Date() },
    })
    .returning({ id: consultoriaConfiguracoes.id })

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Consultoria salva.',
    dados: salva,
  }
}

/**
 * Substitui as faixas semanais em bloco.
 *
 * ## Por que em bloco, e dentro de uma transação
 *
 * A regra "faixas do mesmo dia não podem se sobrepor" é uma propriedade do
 * **conjunto**, não de cada linha. Editar uma por vez obrigaria a passar por
 * estados intermediários inválidos (ou a recusar uma troca legítima de horário
 * porque a faixa antiga ainda estava lá). Trocar tudo de uma vez é o que
 * permite validar exatamente o que vai ficar gravado.
 *
 * O `for update` na linha da configuração serializa duas edições simultâneas da
 * mesma agenda: sem ele, duas requisições poderiam validar contra o estado
 * antigo e gravar juntas um conjunto sobreposto. O índice único parcial da
 * tabela cobre o caso mais grosseiro (duas faixas ativas começando no mesmo
 * minuto); a sobreposição parcial é esta validação aqui.
 */
export async function salvarDisponibilidades(entrada: unknown) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = FaixasSemanaisSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) }
  }

  return db.transaction(async (tx) => {
    const [configuracao] = await tx
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, prestador.usuarioId))
      .for('update')
      .limit(1)

    if (!configuracao) {
      return {
        sucesso: false as const,
        mensagem: 'Configure a consultoria antes de definir os horários.',
      }
    }

    await tx
      .delete(consultoriaDisponibilidades)
      .where(eq(consultoriaDisponibilidades.configuracaoId, configuracao.id))

    if (validacao.data.length) {
      await tx.insert(consultoriaDisponibilidades).values(
        validacao.data.map((faixa) => ({
          configuracaoId: configuracao.id,
          diaSemana: faixa.diaSemana,
          horaInicio: horaParaColuna(faixa.horaInicio),
          horaFim: horaParaColuna(faixa.horaFim),
        })),
      )
    }

    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem: 'Horários de atendimento atualizados.',
      dados: { total: validacao.data.length },
    }
  })
}

/** Registra um feriado, um bloqueio parcial ou um atendimento excepcional. */
export async function criarExcecao(entrada: unknown) {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = ExcecaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: primeiraMensagem(validacao.error) }
  }

  const [configuracao] = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, prestador.usuarioId))
    .limit(1)

  if (!configuracao) {
    return {
      sucesso: false as const,
      mensagem: 'Configure a consultoria antes de registrar exceções.',
    }
  }

  const dados = validacao.data
  const [criada] = await db
    .insert(consultoriaExcecoes)
    .values({
      configuracaoId: configuracao.id,
      data: dados.data,
      tipo: dados.tipo,
      // Dia inteiro não tem hora, e o `check` da tabela cobra isso de volta.
      horaInicio: dados.horaInicio ? horaParaColuna(dados.horaInicio) : null,
      horaFim: dados.horaFim ? horaParaColuna(dados.horaFim) : null,
      motivo: dados.motivo || null,
    })
    .returning({ id: consultoriaExcecoes.id })

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Exceção registrada.', dados: criada }
}

/**
 * Remove uma exceção.
 *
 * O `delete` carrega a condição de posse na própria cláusula `where`, via
 * junção com a configuração do prestador da sessão: conhecer o id de uma
 * exceção alheia não basta para apagá-la, e a checagem não é um `if` que
 * poderia ser esquecido numa refatoração.
 */
export async function removerExcecao(excecaoId: unknown) {
  const prestador = await obterPrestadorSessao()
  const id = ExcecaoIdSchema.safeParse(excecaoId)
  if (!prestador || !id.success) return SEM_AUTORIZACAO

  const [configuracao] = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, prestador.usuarioId))
    .limit(1)

  if (!configuracao) return SEM_AUTORIZACAO

  const removidas = await db
    .delete(consultoriaExcecoes)
    .where(
      and(
        eq(consultoriaExcecoes.id, id.data),
        eq(consultoriaExcecoes.configuracaoId, configuracao.id),
      ),
    )
    .returning({ id: consultoriaExcecoes.id })

  if (!removidas.length) return SEM_AUTORIZACAO

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Exceção removida.' }
}
