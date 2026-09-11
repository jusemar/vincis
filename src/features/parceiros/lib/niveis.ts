import { and, asc, desc, eq, max, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturas,
  parceiroAtribuicoes,
  parceiroNivelConfiguracoes,
  parceiroNivelEstados,
  parceiroNivelHistorico,
  parceiroNivelRegras,
  parceiroNiveis,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante } from '@/features/consultorias/lib/tempo'

/*
  Os níveis do Programa de Parceiros.

  Nenhum número de negócio mora neste arquivo. Percentual, mínimo de clientes
  e dias de proteção vêm da configuração publicada pela Gestão
  (`parceiro_nivel_configuracoes` + `parceiro_nivel_regras`); a estrutura —
  quais níveis existem e em que ordem — vem de `parceiro_niveis`. Sem
  configuração válida, nada é calculado e nenhuma comissão nasce: inventar um
  percentual seria pior do que não pagar agora e pagar certo depois.
*/

type Banco = typeof db
type Transacao = Parameters<Parameters<Banco['transaction']>[0]>[0]
type Leitor = Pick<Banco, 'select'>

/** Limites de sanidade, não regra comercial: 100% e dez anos. */
const CENTESIMOS_MAXIMO = 10_000
const PROTECAO_MAXIMA_DIAS = 3_650
const DIA_EM_MS = 86_400_000

export type NivelEstrutural = { codigo: string; nome: string; ordem: number }
export type RegraDeNivel = NivelEstrutural & {
  minimoClientes: number
  /** 500 = 5%. */
  percentualCentesimos: number
}
export type ConfiguracaoDeNiveis = {
  versao: number
  protecaoDias: number
  vigenteDesde: Date
  /** Da base para o topo. */
  niveis: RegraDeNivel[]
}
export type RegraInformada = {
  codigo: string
  minimoClientes: number
  percentualCentesimos: number
}

export type MotivoDeMudancaDeNivel =
  | 'inicial'
  | 'subida_por_clientes'
  | 'queda_apos_protecao'
  | 'mudanca_configuracao'

/** Sem configuração publicada e válida, nível e comissão recorrente param. */
export class ConfiguracaoDeNiveisIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'ConfiguracaoDeNiveisIndisponivel'
  }
}

/**
 * Um texto como "8,25", "8.25", "8" ou "8%" em centésimos, sem ponto flutuante.
 *
 * Até três dígitos inteiros e duas casas. Fora disso — ou acima de 100% —
 * devolve nulo, e quem chamou recusa com mensagem.
 */
export function lerPercentualEmCentesimos(texto: string): number | null {
  const limpo = texto.trim().replace(/%$/, '').trim()
  const partes = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(limpo)
  if (!partes) return null
  const centesimos = Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'))
  return centesimos <= CENTESIMOS_MAXIMO ? centesimos : null
}

/**
 * A configuração faz sentido?
 *
 * - todo nível estrutural tem exatamente uma regra;
 * - percentuais inteiros em centésimos, de 0% a 100%;
 * - mínimos inteiros; a base exige zero e cada nível acima exige mais que o
 *   anterior — é isso que torna "o maior nível atingido" sempre definido;
 * - proteção inteira, em dias, não negativa.
 *
 * Devolve a primeira mensagem de erro, ou nulo.
 */
export function validarConfiguracaoDeNiveis(
  estruturais: NivelEstrutural[],
  protecaoDias: number,
  regras: RegraInformada[],
): string | null {
  if (!estruturais.length) return 'Os níveis do programa não estão cadastrados.'
  if (
    !Number.isInteger(protecaoDias) ||
    protecaoDias < 0 ||
    protecaoDias > PROTECAO_MAXIMA_DIAS
  ) {
    return `A proteção precisa ser um número inteiro de dias, de 0 a ${PROTECAO_MAXIMA_DIAS}.`
  }
  const ordenados = [...estruturais].sort((a, b) => a.ordem - b.ordem)
  if (new Set(ordenados.map((n) => n.ordem)).size !== ordenados.length) {
    return 'Há níveis com a mesma ordem.'
  }
  if (
    regras.length !== ordenados.length ||
    new Set(regras.map((r) => r.codigo)).size !== regras.length
  ) {
    return 'Informe a regra de cada nível exatamente uma vez.'
  }

  let anterior: { nome: string; minimo: number } | null = null
  for (const nivel of ordenados) {
    const regra = regras.find((r) => r.codigo === nivel.codigo)
    if (!regra) return `Falta a regra do nível ${nivel.nome}.`
    if (
      !Number.isInteger(regra.percentualCentesimos) ||
      regra.percentualCentesimos < 0 ||
      regra.percentualCentesimos > CENTESIMOS_MAXIMO
    ) {
      return `O percentual de ${nivel.nome} precisa estar entre 0% e 100%, com até duas casas.`
    }
    if (!Number.isInteger(regra.minimoClientes) || regra.minimoClientes < 0) {
      return `O mínimo de ${nivel.nome} precisa ser um número inteiro de clientes.`
    }
    if (anterior === null) {
      if (regra.minimoClientes !== 0) {
        return `${nivel.nome} é o nível de entrada e não exige clientes.`
      }
    } else if (regra.minimoClientes <= anterior.minimo) {
      return `${nivel.nome} precisa exigir mais clientes que ${anterior.nome}.`
    }
    anterior = { nome: nivel.nome, minimo: regra.minimoClientes }
  }
  return null
}

export type LeituraDaConfiguracao =
  | { ok: true; configuracao: ConfiguracaoDeNiveis }
  | { ok: false; motivo: string; estruturais: NivelEstrutural[] }

/** A versão vigente — a de maior número —, validada. */
export async function obterConfiguracaoVigente(
  executor: Leitor = db,
): Promise<LeituraDaConfiguracao> {
  const estruturais = await executor
    .select({
      codigo: parceiroNiveis.codigo,
      nome: parceiroNiveis.nome,
      ordem: parceiroNiveis.ordem,
    })
    .from(parceiroNiveis)
    .orderBy(asc(parceiroNiveis.ordem))

  const [versao] = await executor
    .select({
      id: parceiroNivelConfiguracoes.id,
      versao: parceiroNivelConfiguracoes.versao,
      protecaoDias: parceiroNivelConfiguracoes.protecaoDias,
      vigenteDesde: parceiroNivelConfiguracoes.vigenteDesde,
    })
    .from(parceiroNivelConfiguracoes)
    .orderBy(desc(parceiroNivelConfiguracoes.versao))
    .limit(1)
  if (!versao) {
    return { ok: false, motivo: 'Nenhuma configuração de níveis foi publicada.', estruturais }
  }

  const regras = await executor
    .select({
      codigo: parceiroNivelRegras.nivelCodigo,
      minimoClientes: parceiroNivelRegras.minimoClientes,
      percentualCentesimos: parceiroNivelRegras.percentualCentesimos,
    })
    .from(parceiroNivelRegras)
    .where(eq(parceiroNivelRegras.configuracaoId, versao.id))

  const erro = validarConfiguracaoDeNiveis(estruturais, versao.protecaoDias, regras)
  if (erro) {
    return {
      ok: false,
      motivo: `A configuração de níveis publicada é inválida: ${erro}`,
      estruturais,
    }
  }

  return {
    ok: true,
    configuracao: {
      versao: versao.versao,
      protecaoDias: versao.protecaoDias,
      vigenteDesde: versao.vigenteDesde,
      niveis: estruturais.map((nivel) => {
        const regra = regras.find((r) => r.codigo === nivel.codigo)!
        return {
          ...nivel,
          minimoClientes: regra.minimoClientes,
          percentualCentesimos: regra.percentualCentesimos,
        }
      }),
    },
  }
}

export type ResultadoDaPublicacao =
  | { ok: true; versao: number; inalterada: boolean }
  | { ok: false; mensagem: string }

/**
 * Publica uma nova versão da configuração.
 *
 * Uma publicação por vez (trava consultiva da transação): a versão seguinte é
 * calculada e gravada lá dentro. Configuração inválida não é gravada; igual à
 * vigente não gera versão nova. Comissões já criadas não mudam — o percentual
 * delas está congelado nelas —, e os níveis são refeitos sob demanda, então
 * mudar um limite não dispara atualização em massa.
 */
export async function publicarConfiguracaoDeNiveis({
  protecaoDias,
  regras,
  autorId,
}: {
  protecaoDias: number
  regras: RegraInformada[]
  autorId: string | null
}): Promise<ResultadoDaPublicacao> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('parceiro_nivel_configuracoes'))`)

    const atual = await obterConfiguracaoVigente(tx)
    const estruturais = atual.ok ? atual.configuracao.niveis : atual.estruturais
    const erro = validarConfiguracaoDeNiveis(estruturais, protecaoDias, regras)
    if (erro) return { ok: false as const, mensagem: erro }

    if (
      atual.ok &&
      atual.configuracao.protecaoDias === protecaoDias &&
      atual.configuracao.niveis.every((nivel) => {
        const regra = regras.find((r) => r.codigo === nivel.codigo)!
        return (
          regra.minimoClientes === nivel.minimoClientes &&
          regra.percentualCentesimos === nivel.percentualCentesimos
        )
      })
    ) {
      return { ok: true as const, versao: atual.configuracao.versao, inalterada: true }
    }

    const [ultima] = await tx
      .select({ versao: max(parceiroNivelConfiguracoes.versao) })
      .from(parceiroNivelConfiguracoes)
    const versao = (ultima?.versao ?? 0) + 1

    const [criada] = await tx
      .insert(parceiroNivelConfiguracoes)
      .values({ versao, protecaoDias, criadaPor: autorId })
      .returning({ id: parceiroNivelConfiguracoes.id })
    await tx.insert(parceiroNivelRegras).values(
      regras.map((regra) => ({
        configuracaoId: criada.id,
        nivelCodigo: regra.codigo,
        minimoClientes: regra.minimoClientes,
        percentualCentesimos: regra.percentualCentesimos,
      })),
    )

    const resumir = (niveis: RegraInformada[]) =>
      niveis.map(({ codigo, minimoClientes, percentualCentesimos }) => ({
        codigo,
        minimoClientes,
        percentualCentesimos,
      }))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.parceiroNiveisConfigurados,
        entidade: 'parceiro_nivel_configuracoes',
        registroAfetado: criada.id,
        autorId,
        origem: 'gestao_vincis',
        metadados: {
          versaoAnterior: atual.ok ? atual.configuracao.versao : null,
          versaoNova: versao,
          anterior: atual.ok
            ? {
                protecaoDias: atual.configuracao.protecaoDias,
                niveis: resumir(atual.configuracao.niveis),
              }
            : null,
          nova: { protecaoDias, niveis: resumir(regras) },
        },
      },
      tx,
    )

    return { ok: true as const, versao, inalterada: false }
  })
}

/**
 * Quantos clientes recorrentes ativos o parceiro tem agora.
 *
 * Clientes **distintos** cuja assinatura:
 *
 * - foi originada por este parceiro (atribuição — só a primeira assinatura
 *   ativada da conta tem uma);
 * - está `ativa` — nem aguardando pagamento, nem cancelada, nem encerrada;
 * - tem, hoje, um mês não cancelado cujo período contém a data de hoje (São
 *   Paulo) e que está coberto por pagamento **confirmado**.
 *
 * O último item é o que separa "ativa no cadastro" de "vigente de verdade": o
 * semestral que terminou, o mensal que não renovou e o pagamento estornado
 * deixam de contar sem que ninguém precise mudar status. Lead, visitante,
 * cadastro sem contrato, assinatura abandonada e avulso nunca contam.
 */
export async function contarClientesRecorrentesAtivos(
  executor: Leitor,
  parceiroId: string,
  agora: Date = new Date(),
): Promise<number> {
  const hoje = dataLocalDoInstante(agora, TIMEZONE_PADRAO)
  const [linha] = await executor
    .select({
      total: sql<number>`count(distinct ${assinaturas.clienteUsuarioId})`.mapWith(Number),
    })
    .from(parceiroAtribuicoes)
    .innerJoin(assinaturas, eq(assinaturas.id, parceiroAtribuicoes.assinaturaId))
    .where(
      and(
        eq(parceiroAtribuicoes.parceiroId, parceiroId),
        eq(assinaturas.status, 'ativa'),
        sql`exists (
          select 1
          from assinatura_competencias c
          where c.assinatura_id = ${assinaturas.id}
            and c.status <> 'cancelada'
            and c.periodo_inicio <= ${hoje}
            and c.periodo_fim >= ${hoje}
            and c.valor_base_centavos <= (
              select coalesce(sum(al.valor_centavos), 0)
              from assinatura_pagamento_alocacoes al
              join assinatura_pagamentos p on p.id = al.pagamento_id
              where al.competencia_id = c.id and p.status = 'confirmado'
            )
        )`,
      ),
    )
  return linha?.total ?? 0
}

/** O maior nível cuja regra a contagem atende. A base exige zero: sempre há um. */
export function nivelPorClientes(
  configuracao: ConfiguracaoDeNiveis,
  clientes: number,
): RegraDeNivel {
  let atingido = configuracao.niveis[0]
  for (const nivel of configuracao.niveis) {
    if (clientes >= nivel.minimoClientes) atingido = nivel
  }
  return atingido
}

export type NivelCalculado = {
  nivel: RegraDeNivel
  clientesAtivos: number
  protegidoAte: Date | null
  configuracao: ConfiguracaoDeNiveis
  mudou: boolean
}

/**
 * Refaz o nível do parceiro, com a linha de estado travada.
 *
 * ## A regra
 *
 * 1. conta os clientes recorrentes ativos agora;
 * 2. acha o maior nível que a contagem atende, pela configuração **vigente**;
 * 3. acima do atual → sobe na hora e ganha a proteção configurada **agora**,
 *    congelada em `protegido_ate`;
 * 4. abaixo do atual → só cai se a proteção já acabou, e cai para o maior nível
 *    atendido (de Ouro pode ir a Prata, não necessariamente à base);
 * 5. igual → só atualiza a contagem.
 *
 * Mudar a configuração durante uma proteção não a encurta nem a estende: a
 * data concedida fica, e no fim dela a regra vigente naquele momento decide.
 *
 * ## Travas
 *
 * A linha do parceiro fica travada até o fim da transação: duas comissões
 * nascendo juntas veem o mesmo nível, uma depois da outra, e cada uma congela
 * um percentual só. Idempotente: recalcular sem nada novo não muda nada.
 */
export async function recalcularNivelDoParceiro(
  tx: Transacao,
  parceiroId: string,
  { agora = new Date() }: { agora?: Date } = {},
): Promise<NivelCalculado> {
  const lida = await obterConfiguracaoVigente(tx)
  if (!lida.ok) throw new ConfiguracaoDeNiveisIndisponivel(lida.motivo)
  const configuracao = lida.configuracao
  const base = configuracao.niveis[0]

  const [criado] = await tx
    .insert(parceiroNivelEstados)
    .values({
      parceiroId,
      nivelCodigo: base.codigo,
      nivelDesde: agora,
      clientesAtivos: 0,
      configuracaoVersao: configuracao.versao,
      calculadoEm: agora,
    })
    .onConflictDoNothing()
    .returning({ parceiroId: parceiroNivelEstados.parceiroId })
  if (criado) {
    await tx.insert(parceiroNivelHistorico).values({
      parceiroId,
      nivelAnterior: null,
      nivelNovo: base.codigo,
      clientesAtivos: 0,
      motivo: 'inicial',
      configuracaoVersao: configuracao.versao,
    })
  }

  const [estado] = await tx
    .select()
    .from(parceiroNivelEstados)
    .where(eq(parceiroNivelEstados.parceiroId, parceiroId))
    .limit(1)
    .for('update')

  const clientes = await contarClientesRecorrentesAtivos(tx, parceiroId, agora)
  const atingido = nivelPorClientes(configuracao, clientes)
  const atual =
    configuracao.niveis.find((nivel) => nivel.codigo === estado.nivelCodigo) ?? base
  // A contagem é a mesma e a versão mudou: quem mexeu no nível foi a regra.
  const porConfiguracao =
    estado.configuracaoVersao !== configuracao.versao &&
    estado.clientesAtivos === clientes

  let novo = atual
  let protegidoAte = estado.protegidoAte
  let protecaoAnteriorAte: Date | null = null
  let motivo: MotivoDeMudancaDeNivel | null = null

  if (atingido.ordem > atual.ordem) {
    novo = atingido
    protegidoAte =
      configuracao.protecaoDias > 0
        ? new Date(agora.getTime() + configuracao.protecaoDias * DIA_EM_MS)
        : null
    motivo = porConfiguracao ? 'mudanca_configuracao' : 'subida_por_clientes'
  } else if (atingido.ordem < atual.ordem) {
    const protegido = estado.protegidoAte !== null && agora < estado.protegidoAte
    if (!protegido) {
      novo = atingido
      protecaoAnteriorAte = estado.protegidoAte
      protegidoAte = null
      motivo = porConfiguracao ? 'mudanca_configuracao' : 'queda_apos_protecao'
    }
  }

  await tx
    .update(parceiroNivelEstados)
    .set({
      nivelCodigo: novo.codigo,
      nivelDesde: motivo ? agora : estado.nivelDesde,
      protegidoAte,
      clientesAtivos: clientes,
      configuracaoVersao: configuracao.versao,
      calculadoEm: agora,
      updatedAt: agora,
    })
    .where(eq(parceiroNivelEstados.parceiroId, parceiroId))

  if (motivo) {
    await tx.insert(parceiroNivelHistorico).values({
      parceiroId,
      nivelAnterior: atual.codigo,
      nivelNovo: novo.codigo,
      clientesAtivos: clientes,
      motivo,
      protegidoAte,
      protecaoAnteriorAte,
      configuracaoVersao: configuracao.versao,
    })
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.parceiroNivelAlterado,
        entidade: 'parceiro_nivel_estados',
        registroAfetado: parceiroId,
        origem: 'sistema',
        metadados: {
          parceiroId,
          nivelAnterior: atual.codigo,
          nivelNovo: novo.codigo,
          clientesAtivos: clientes,
          motivo,
          protegidoAte: protegidoAte?.toISOString() ?? null,
          configuracaoVersao: configuracao.versao,
        },
      },
      tx,
    )
  }

  return {
    nivel: novo,
    clientesAtivos: clientes,
    protegidoAte,
    configuracao,
    mudou: motivo !== null,
  }
}

/**
 * O mesmo, num ponto de salvamento: pagamento e estorno não podem falhar
 * porque o nível do parceiro não pôde ser refeito. O próximo cálculo refaz.
 */
export async function recalcularNivelSemDerrubar(
  tx: Transacao,
  parceiroId: string,
): Promise<NivelCalculado | null> {
  try {
    return await tx.transaction((interna) => recalcularNivelDoParceiro(interna, parceiroId))
  } catch (erro) {
    console.error('[PARCEIROS] falha ao recalcular nível', {
      parceiroId,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return null
  }
}

/** O que a página pública mostra: só o necessário para exibir a trilha. */
export type NivelPublico = {
  codigo: string
  nome: string
  minimoClientes: number
  percentualCentesimos: number
}
export type NiveisPublicos = { niveis: NivelPublico[]; protecaoDias: number }

/**
 * Os níveis para a vitrine pública.
 *
 * A mesma configuração vigente que o motor e o painel usam, recortada: nome,
 * percentual, mínimo de clientes e os dias de proteção. Versão, identificadores
 * e histórico não saem daqui — a página pública não precisa deles.
 *
 * Nulo quando não há configuração válida: a página esconde a trilha em vez de
 * mostrar percentual inventado.
 */
export async function obterNiveisPublicos(): Promise<NiveisPublicos | null> {
  const lida = await obterConfiguracaoVigente()
  if (!lida.ok) {
    console.error('[PARCEIROS] níveis públicos indisponíveis', { motivo: lida.motivo })
    return null
  }
  return {
    niveis: lida.configuracao.niveis.map(
      ({ codigo, nome, minimoClientes, percentualCentesimos }) => ({
        codigo,
        nome,
        minimoClientes,
        percentualCentesimos,
      }),
    ),
    protecaoDias: lida.configuracao.protecaoDias,
  }
}

/** O que o painel do parceiro mostra sobre o nível. Tudo vem da configuração. */
export type SituacaoDeNivel = {
  nivel: RegraDeNivel
  clientesAtivos: number
  /** Só quando ainda está no futuro. */
  protegidoAte: Date | null
  proximo: (RegraDeNivel & { faltam: number }) | null
  /** 0–100: clientes atuais sobre o mínimo do próximo nível. */
  progresso: number
  niveis: RegraDeNivel[]
  protecaoDias: number
  configuracaoVersao: number
}

export function montarSituacaoDeNivel(
  calculado: NivelCalculado,
  agora: Date = new Date(),
): SituacaoDeNivel {
  const { configuracao, nivel, clientesAtivos } = calculado
  const seguinte = configuracao.niveis.find((n) => n.ordem > nivel.ordem) ?? null
  const proximo = seguinte
    ? { ...seguinte, faltam: Math.max(0, seguinte.minimoClientes - clientesAtivos) }
    : null
  const progresso = proximo
    ? Math.min(100, Math.round((clientesAtivos / Math.max(1, proximo.minimoClientes)) * 100))
    : 100
  return {
    nivel,
    clientesAtivos,
    protegidoAte:
      calculado.protegidoAte && calculado.protegidoAte > agora ? calculado.protegidoAte : null,
    proximo,
    progresso,
    niveis: configuracao.niveis,
    protecaoDias: configuracao.protecaoDias,
    configuracaoVersao: configuracao.versao,
  }
}

/**
 * O nível do parceiro para o painel, refeito agora.
 *
 * Nulo quando a configuração está ausente ou inválida: a tela diz que os níveis
 * estão indisponíveis em vez de mostrar um percentual inventado.
 */
export async function obterSituacaoDeNivel(
  parceiroId: string,
  agora: Date = new Date(),
): Promise<SituacaoDeNivel | null> {
  try {
    const calculado = await db.transaction((tx) =>
      recalcularNivelDoParceiro(tx, parceiroId, { agora }),
    )
    return montarSituacaoDeNivel(calculado, agora)
  } catch (erro) {
    if (erro instanceof ConfiguracaoDeNiveisIndisponivel) {
      console.error('[PARCEIROS] níveis indisponíveis', { motivo: erro.message })
      return null
    }
    throw erro
  }
}
