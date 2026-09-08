import { asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  contratacoesServico,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { alias } from 'drizzle-orm/pg-core'
import { tipoDoNegocio } from '../constants/programa'
import { statusComissaoValido, type StatusComissao } from '../constants/comissao'

/** O profissional do negócio — a mesma tabela de contas, em outro papel. */
const profissional = alias(usuarios, 'profissional_do_negocio')

export type EventoDaIndicacao = {
  id: string
  tipo: string
  /** Carga própria do tipo, quando existe. Ver `detalheDoEvento`. */
  dados: unknown
  ocorridoEm: Date
}

/**
 * O lead depois de identificado.
 *
 * Nulo enquanto ninguém se cadastrou por aquele ciclo — e nesse caso a tela diz
 * "visitante não identificado", que é a verdade.
 */
export type LeadIdentificado = {
  nome: string
  email: string
  whatsapp: string | null
  /** Quando a conta nasceu. Sempre posterior ao acesso que a originou. */
  criadoEm: Date
}

/**
 * Um negócio originado por esta indicação, com a janela que valia quando ele
 * nasceu.
 *
 * `prazoDias` e `expiraEm` vêm congelados da linha — nunca recalculados a
 * partir da configuração de hoje. É isso que faz uma mudança do Gestor não
 * mexer no que já está em curso.
 */
export type NegocioAtribuido = {
  id: string
  servico: string | null
  iniciadaEm: Date
  prazoDias: number | null
  expiraEm: Date | null
  /**
   * O que o cliente contratou, no nome congelado na contratação.
   *
   * Nulo quando o negócio nasceu de uma oportunidade: ali ainda não existe
   * serviço escolhido, só a categoria da solicitação.
   */
  nome: string | null
  /** `avulso` hoje; recorrência ainda não existe no catálogo. */
  tipo: 'avulso' | 'recorrente' | null
  /** O valor congelado do negócio. Nulo em serviço sob orçamento. */
  valorCentavos: number | null
  /**
   * Contratação efetiva, e não apenas pedido de orçamento.
   *
   * `aguardando_orcamento` é o serviço sem preço, que ainda depende de uma
   * proposta — chamar isso de "contratou" seria anunciar um negócio que pode
   * não acontecer.
   */
  contratado: boolean
  /**
   * Quem executa o serviço, com o identificador **público**.
   *
   * Nunca o uuid: o card é uma tela de leitura, e o que o parceiro precisa
   * citar é um código conferível. Nulo quando o negócio ainda não tem
   * profissional — e aí a tela diz isso, em vez de inventar um nome.
   */
  profissional: { nome: string; codigoPublico: string | null } | null
  /** A comissão real que este negócio gerou, quando gerou. */
  comissao: { valorCentavos: number; percentual: number; status: StatusComissao } | null
}

export type IndicacaoDoParceiro = {
  id: string
  criadoEm: Date
  origem: string
  /** Deixou de ser o ciclo atual deste navegador. Continua no histórico. */
  substituidaEm: Date | null
  /** A conta que nasceu desta indicação, quando já existe. */
  lead: LeadIdentificado | null
  /** Os negócios que nasceram dela, com prazo e validade próprios. */
  negocios: NegocioAtribuido[]
  eventos: EventoDaIndicacao[]
}

/**
 * Os ciclos de indicação de um parceiro, do mais recente para o mais antigo.
 *
 * ## O que não sai daqui
 *
 * Nem `visitante_hash`, nem `user_agent`, nem host de origem — os campos
 * técnicos ficam no banco para auditoria e param ali. Da conta associada saem
 * quatro campos e nada além: nome, e-mail, WhatsApp e data de criação. Senha,
 * hash, tokens, sessão, status e perfil não são recorte de acompanhamento
 * comercial, e o `select` explícito é o que garante que não passem — um
 * `select()` sem colunas devolveria a linha inteira de `usuarios`.
 *
 * Enquanto o ciclo não tem conta associada, `lead` é nulo: o visitante é
 * anônimo, e não há nome nenhum a mostrar.
 *
 * ## Duas consultas, não N+1
 *
 * Os ciclos numa consulta e os eventos de todos eles em outra, agrupados na
 * memória. Um parceiro com trinta indicações faria trinta e uma viagens ao
 * banco se cada linha buscasse o próprio histórico.
 */
export async function listarIndicacoesDoParceiro(
  parceiroId: string,
  limite = 50,
): Promise<IndicacaoDoParceiro[]> {
  const ciclos = await db
    .select({
      id: parceiroIndicacoes.id,
      criadoEm: parceiroIndicacoes.createdAt,
      origem: parceiroIndicacoes.origem,
      substituidaEm: parceiroIndicacoes.substituidaEm,
      leadNome: usuarios.nome,
      leadEmail: usuarios.email,
      leadWhatsapp: usuarios.whatsapp,
      leadCriadoEm: usuarios.createdAt,
    })
    .from(parceiroIndicacoes)
    .leftJoin(usuarios, eq(usuarios.id, parceiroIndicacoes.usuarioId))
    .where(eq(parceiroIndicacoes.parceiroId, parceiroId))
    .orderBy(desc(parceiroIndicacoes.createdAt))
    .limit(limite)

  if (!ciclos.length) return []

  const eventos = await db
    .select({
      id: parceiroEventos.id,
      indicacaoId: parceiroEventos.indicacaoId,
      tipo: parceiroEventos.tipo,
      dados: parceiroEventos.dados,
      ocorridoEm: parceiroEventos.ocorridoEm,
    })
    .from(parceiroEventos)
    .where(
      inArray(
        parceiroEventos.indicacaoId,
        ciclos.map((ciclo) => ciclo.id),
      ),
    )
    // Cronológica: o histórico se lê de cima para baixo, do primeiro acesso
    // para o que veio depois.
    .orderBy(asc(parceiroEventos.ocorridoEm))

  /*
    O que a contratação congelou entra junto.

    Nome e valor vêm do *snapshot* da contratação, nunca do catálogo de hoje:
    o prestador pode renomear o serviço ou mudar o preço amanhã, e o negócio
    que o parceiro trouxe continua sendo o que foi. É o mesmo princípio de
    `prazo_dias` e `expira_em`.
  */
  const atribuicoes = await db
    .select({
      id: parceiroAtribuicoes.id,
      indicacaoId: parceiroAtribuicoes.indicacaoId,
      servico: parceiroAtribuicoes.servicoReferencia,
      iniciadaEm: parceiroAtribuicoes.createdAt,
      prazoDias: parceiroAtribuicoes.prazoDias,
      expiraEm: parceiroAtribuicoes.expiraEm,
      nome: contratacoesServico.nomeServicoSnapshot,
      modeloPreco: contratacoesServico.modeloPrecoSnapshot,
      valorCentavos: contratacoesServico.valorSnapshotCentavos,
      statusContratacao: contratacoesServico.status,
      profissionalNome: profissional.nome,
      profissionalCodigo: perfisProfissionais.codigoPublico,
      comissaoCentavos: parceiroComissoes.valorCentavos,
      comissaoPercentual: parceiroComissoes.percentual,
      comissaoStatus: parceiroComissoes.status,
    })
    .from(parceiroAtribuicoes)
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, parceiroAtribuicoes.contratacaoId),
    )
    .leftJoin(profissional, eq(profissional.id, contratacoesServico.prestadorId))
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, contratacoesServico.prestadorId),
    )
    .leftJoin(
      parceiroComissoes,
      eq(parceiroComissoes.atribuicaoId, parceiroAtribuicoes.id),
    )
    .where(
      inArray(
        parceiroAtribuicoes.indicacaoId,
        ciclos.map((ciclo) => ciclo.id),
      ),
    )
    .orderBy(asc(parceiroAtribuicoes.createdAt))

  const negociosPorCiclo = new Map<string, NegocioAtribuido[]>()
  for (const {
    indicacaoId,
    modeloPreco,
    statusContratacao,
    profissionalNome,
    profissionalCodigo,
    comissaoCentavos,
    comissaoPercentual,
    comissaoStatus,
    ...negocio
  } of atribuicoes) {
    const lista = negociosPorCiclo.get(indicacaoId) ?? []
    lista.push({
      ...negocio,
      tipo: tipoDoNegocio(modeloPreco),
      contratado:
        statusContratacao !== null && statusContratacao !== 'aguardando_orcamento',
      profissional: profissionalNome
        ? { nome: profissionalNome, codigoPublico: profissionalCodigo }
        : null,
      comissao:
        comissaoCentavos !== null &&
        comissaoStatus !== null &&
        statusComissaoValido(comissaoStatus)
          ? {
              valorCentavos: comissaoCentavos,
              percentual: Number(comissaoPercentual),
              status: comissaoStatus,
            }
          : null,
    })
    negociosPorCiclo.set(indicacaoId, lista)
  }

  const porCiclo = new Map<string, EventoDaIndicacao[]>()
  for (const evento of eventos) {
    const lista = porCiclo.get(evento.indicacaoId) ?? []
    lista.push({
      id: evento.id,
      tipo: evento.tipo,
      dados: evento.dados,
      ocorridoEm: evento.ocorridoEm,
    })
    porCiclo.set(evento.indicacaoId, lista)
  }

  return ciclos.map(
    ({ leadNome, leadEmail, leadWhatsapp, leadCriadoEm, ...ciclo }) => ({
      ...ciclo,
      lead:
        leadNome && leadEmail && leadCriadoEm
          ? {
              nome: leadNome,
              email: leadEmail,
              whatsapp: leadWhatsapp,
              criadoEm: leadCriadoEm,
            }
          : null,
      negocios: negociosPorCiclo.get(ciclo.id) ?? [],
      eventos: porCiclo.get(ciclo.id) ?? [],
    }),
  )
}
