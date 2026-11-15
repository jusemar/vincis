import { and, asc, eq, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { clienteJaOcupaVaga, ocupacaoPorContador } from '@/features/assinaturas/queries/carteira-do-contador'
import { situacaoDaCapacidade } from '@/features/assinaturas/constants/contador-responsavel'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitadoDoTipo } from '@/features/usuarios/lib/prestador'
import { TIPO_PROFISSIONAL_COM_MODELO } from '../constants/modelo-contratacao'

export type ContadorParceiro = {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
  /** Capacidade máxima de clientes recorrentes; nula = sem limite definido. */
  capacidade: number | null
  /** Clientes com plano ativo (pago) sob a responsabilidade dele. */
  ativos: number
  /** Clientes só com plano pendente que reserva vaga. */
  reservados: number
  /** ativos + reservados — o que conta contra a capacidade. */
  ocupados: number
  /** No limite (ocupados ≥ capacidade): mantém os atuais e não recebe novos. */
  lotado: boolean
  /** Capacidade reduzida abaixo do já ocupado: ninguém sai, nada novo entra. */
  acimaDoLimite: boolean
}

/**
 * Quem pode ser contador responsável por um plano contábil da Vincis.
 *
 * As mesmas portas da busca pública (conta ativa e verificada, cadastro
 * profissional aprovado) mais as duas desta regra: contabilidade e
 * `modelo_contratacao = 'vincis'`. Autônomo e "não definido" nunca entram —
 * o Autônomo negocia e recebe direto, fora dos planos da Vincis.
 *
 * A capacidade (`capacidade_clientes_recorrentes`) não tira ninguém daqui:
 * cada contador vem com a ocupação (ativos + reservas de planos pendentes) e
 * `lotado`, e quem decide é o uso — a lista do
 * cliente esconde os lotados, a Gestão os mostra com aviso e a alocação os
 * recusa (`assinaturas/lib/contador-responsavel.ts`).
 */
function condicoesDeElegibilidade(): SQL[] {
  return [
    eq(usuarios.status, 'ativo'),
    condicaoContaVerificada(),
    condicaoPrestadorHabilitadoDoTipo('profissional'),
    eq(perfisProfissionais.tipoProfissional, TIPO_PROFISSIONAL_COM_MODELO),
    eq(perfisProfissionais.modeloContratacao, 'vincis'),
  ]
}

const colunas = {
  id: usuarios.id,
  nome: usuarios.nome,
  cidade: perfisProfissionais.cidade,
  estado: perfisProfissionais.estado,
  capacidade: perfisProfissionais.capacidadeClientesRecorrentes,
}

/** O que a vitrine `/precos` recebe: sem capacidade nem ocupação do contador. */
export type ContadorParceiroPublico = Pick<ContadorParceiro, 'id' | 'nome' | 'cidade' | 'estado'>

async function comCapacidade(
  executor: ExecutorDb,
  linhas: Pick<ContadorParceiro, 'id' | 'nome' | 'cidade' | 'estado' | 'capacidade'>[],
): Promise<ContadorParceiro[]> {
  const ocupacao = await ocupacaoPorContador(linhas.map((l) => l.id), executor)
  return linhas.map((l) => ({
    ...l,
    ...situacaoDaCapacidade(l.capacidade, ocupacao.get(l.id) ?? { ativos: 0, reservados: 0, ocupados: 0 }),
  }))
}

/**
 * Contadores parceiros aptos, com a ocupação de cada um.
 *
 * `somenteComVaga` é a lista do cliente em `/precos`: quem está no limite não
 * aparece para novos clientes. A Gestão pede a lista inteira.
 */
export async function listarContadoresParceiros(
  executor: ExecutorDb = db,
  { somenteComVaga = false }: { somenteComVaga?: boolean } = {},
): Promise<ContadorParceiro[]> {
  const linhas = await executor
    .select(colunas)
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(and(...condicoesDeElegibilidade()))
    .orderBy(asc(usuarios.nome))
  const contadores = await comCapacidade(executor, linhas)
  return somenteComVaga ? contadores.filter((c) => !c.lotado) : contadores
}

/** O contador informado é elegível agora? Conferido no servidor a cada uso. */
export async function contadorParceiroElegivel(
  executor: ExecutorDb,
  contadorId: string,
): Promise<ContadorParceiro | null> {
  const [contador] = await executor
    .select(colunas)
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(and(eq(usuarios.id, contadorId), ...condicoesDeElegibilidade()))
    .limit(1)
  if (!contador) return null
  const [comVaga] = await comCapacidade(executor, [contador])
  return comVaga ?? null
}

/**
 * O contador pode receber este cliente agora?
 *
 * Abaixo da capacidade, sim. No limite (inclusive acima dele, após redução),
 * só se o cliente **já** ocupa uma vaga dele — outro plano ativo ou reservado
 * —, porque então nada novo é ocupado. Quem chama em transação deve antes
 * travar o cadastro do contador (`for update`) para que duas entradas
 * simultâneas não disputem a mesma última vaga.
 */
export async function contadorComVagaPara(
  executor: ExecutorDb,
  contadorId: string,
  clienteUsuarioId: string,
  excetoAssinaturaId?: string,
): Promise<{ contador: ContadorParceiro | null; temVaga: boolean }> {
  const contador = await contadorParceiroElegivel(executor, contadorId)
  if (!contador) return { contador: null, temVaga: false }
  if (!contador.lotado) return { contador, temVaga: true }
  return { contador, temVaga: await clienteJaOcupaVaga(executor, contadorId, clienteUsuarioId, excetoAssinaturaId) }
}

/**
 * A conta é contador parceiro da Vincis **agora**?
 *
 * Decide o item "Meus clientes Vincis" do menu (via sessão) e a guarda da rota.
 * Mesmas portas da elegibilidade, sem olhar capacidade: no limite ele continua
 * atendendo — e vendo — os clientes atuais. Autônomo e advogado: `false`.
 */
export async function usuarioContadorParceiroVincis(usuarioId: string, executor: ExecutorDb = db): Promise<boolean> {
  const [linha] = await executor
    .select({ id: usuarios.id })
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(and(eq(usuarios.id, usuarioId), ...condicoesDeElegibilidade()))
    .limit(1)
  return Boolean(linha)
}
