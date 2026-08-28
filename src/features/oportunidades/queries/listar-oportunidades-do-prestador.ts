import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentos,
  oportunidadeArquivos,
  oportunidadeDispensas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { prestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { LIMITE_OPORTUNIDADES_CARREGADAS } from '../constants/oportunidade'
import { montarAnexo } from '../lib/anexos-dto'
import { categoriasCompativeisDoPrestador } from '../lib/compatibilidade'
import { condicaoOportunidadeAtiva, propostaVigente } from '../lib/vigencia-sql'
import { obterNegociacoes } from './contrapropostas-da-proposta'
import type {
  AnexoOportunidadeDTO,
  OportunidadeParaPrestadorDTO,
} from '../types/oportunidade'

/** O cadastro do prestador, no recorte que decide o que ele alcança. */
async function perfilDoPrestador(prestadorId: string) {
  const [perfil] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      especialidades: perfisProfissionais.especialidades,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, prestadorId))
    .limit(1)

  return perfil ?? null
}

/**
 * Os anexos de um conjunto de oportunidades.
 *
 * Consulta separada, e não join, porque uma oportunidade tem vários anexos e
 * várias propostas: juntar tudo numa consulta só multiplicaria as linhas e
 * exigiria desduplicar em memória o que o banco já sabe agrupar. A autorização
 * já foi decidida por quem chamou — aqui só entram ids que a consulta anterior
 * devolveu.
 */
async function anexosDasOportunidades(ids: string[]) {
  const porOportunidade = new Map<string, AnexoOportunidadeDTO[]>()
  if (!ids.length) return porOportunidade

  const linhas = await db
    .select({
      id: oportunidadeArquivos.id,
      oportunidadeId: oportunidadeArquivos.oportunidadeId,
      nome: oportunidadeArquivos.nome,
      tipoMime: oportunidadeArquivos.tipoMime,
      tamanhoBytes: oportunidadeArquivos.tamanhoBytes,
    })
    .from(oportunidadeArquivos)
    .where(inArray(oportunidadeArquivos.oportunidadeId, ids))
    .orderBy(asc(oportunidadeArquivos.createdAt))

  for (const linha of linhas) {
    const lista = porOportunidade.get(linha.oportunidadeId) ?? []
    lista.push(montarAnexo(linha.oportunidadeId, linha))
    porOportunidade.set(linha.oportunidadeId, lista)
  }
  return porOportunidade
}

export { anexosDasOportunidades }

/**
 * As oportunidades abertas que um prestador alcança.
 *
 * Três recortes, todos no SQL:
 *
 * 1. **habilitação** — quem não pode operar não recebe trabalho pela
 *    plataforma, e a lista sai vazia antes de qualquer consulta;
 * 2. **alcance** — as públicas compatíveis com o cadastro dele, mais as
 *    **privadas dirigidas a ele**. Uma solicitação privada de outro prestador
 *    não entra na consulta, mesmo que a categoria bata: a cláusula compara
 *    `destinatario_id` com quem consulta;
 * 3. **privacidade** — o join com as propostas casa `prestador_id` com quem
 *    consulta. Não existe caminho, nem passando id, que traga a proposta de
 *    outro prestador: a coluna simplesmente não é selecionada para ninguém
 *    além do autor.
 *
 * Do Cliente vem apenas o nome. Contato é consequência da contratação.
 */
export async function listarOportunidadesDoPrestador(
  prestadorId: string,
  limite = LIMITE_OPORTUNIDADES_CARREGADAS,
): Promise<OportunidadeParaPrestadorDTO[]> {
  const perfil = await perfilDoPrestador(prestadorId)
  if (!prestadorHabilitado(perfil)) return []

  const categorias = categoriasCompativeisDoPrestador(perfil)
  if (!categorias.length) return []

  const minhaProposta = db.$with('minha_proposta').as(
    db
      .select({
        oportunidadeId: oportunidadePropostas.oportunidadeId,
        id: oportunidadePropostas.id,
        mensagem: oportunidadePropostas.mensagem,
        valorCentavos: oportunidadePropostas.valorCentavos,
        prazoEstimadoDias: oportunidadePropostas.prazoEstimadoDias,
        status: oportunidadePropostas.status,
        criadoEm: oportunidadePropostas.createdAt,
        validaAte: oportunidadePropostas.validaAte,
        aceitaEm: oportunidadePropostas.aceitaEm,
        valorAcordadoCentavos: oportunidadePropostas.valorAcordadoCentavos,
      })
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.prestadorId, prestadorId)),
  )

  // Mesma ideia da proposta: a dispensa é individual, então entra por um CTE
  // já filtrado por quem consulta. Ninguém vê o que outro prestador dispensou.
  const minhaDispensa = db.$with('minha_dispensa').as(
    db
      .select({
        oportunidadeId: oportunidadeDispensas.oportunidadeId,
        criadoEm: oportunidadeDispensas.createdAt,
      })
      .from(oportunidadeDispensas)
      .where(eq(oportunidadeDispensas.prestadorId, prestadorId)),
  )

  const linhas = await db
    .with(minhaProposta, minhaDispensa)
    .select({
      id: oportunidades.id,
      categoria: oportunidades.categoria,
      especialidades: oportunidades.especialidades,
      titulo: oportunidades.titulo,
      descricao: oportunidades.descricao,
      abrangencia: oportunidades.abrangencia,
      valorPretendidoCentavos: oportunidades.valorPretendidoCentavos,
      status: oportunidades.status,
      criadoEm: oportunidades.createdAt,
      clienteNome: usuarios.nome,
      propostaId: minhaProposta.id,
      propostaMensagem: minhaProposta.mensagem,
      propostaValorCentavos: minhaProposta.valorCentavos,
      propostaPrazo: minhaProposta.prazoEstimadoDias,
      propostaStatus: minhaProposta.status,
      propostaCriadoEm: minhaProposta.criadoEm,
      propostaValidaAte: minhaProposta.validaAte,
      propostaAceitaEm: minhaProposta.aceitaEm,
      propostaValorAcordado: minhaProposta.valorAcordadoCentavos,
      dispensadaEm: minhaDispensa.criadoEm,
      visibilidade: oportunidades.visibilidade,
      expiraEm: oportunidades.expiraEm,
      pagamentoEm: oportunidadePagamentos.aprovadoEm,
      pagamentoValor: oportunidadePagamentos.valorCentavos,
      atendimentoId: atendimentos.id,
      atendimentoProtocolo: atendimentos.protocolo,
    })
    .from(oportunidades)
    .innerJoin(usuarios, eq(usuarios.id, oportunidades.clienteUsuarioId))
    .leftJoin(minhaProposta, eq(minhaProposta.oportunidadeId, oportunidades.id))
    .leftJoin(minhaDispensa, eq(minhaDispensa.oportunidadeId, oportunidades.id))
    // Pagamento e protocolo entram por `left join`, mas só chegam à tela do
    // prestador **cujo** `minhaProposta.status` é `aceita` — a montagem abaixo
    // amarra os dois. O concorrente não recebe a linha: para ele a solicitação
    // encerrada simplesmente não está na consulta.
    .leftJoin(
      oportunidadePagamentos,
      eq(oportunidadePagamentos.oportunidadeId, oportunidades.id),
    )
    .leftJoin(atendimentos, eq(atendimentos.oportunidadeId, oportunidades.id))
    .where(
      and(
        inArray(oportunidades.categoria, categorias),
        // A porta privada: pública alcança a categoria, privada alcança uma
        // pessoa. Sem esta condição, todo prestador compatível veria o pedido
        // que o Cliente dirigiu a um só.
        or(
          eq(oportunidades.visibilidade, 'publica'),
          eq(oportunidades.destinatarioId, prestadorId),
        ),
        or(
          // Aberta **e** dentro do prazo global: vencida sai da vitrine mesmo
          // antes de alguém materializar o status.
          condicaoOportunidadeAtiva(),
          // O vencedor continua enxergando a solicitação depois de fechada:
          // é onde ele acompanha o acordo até o pagamento virar protocolo.
          // Quem não fechou não entra por aqui — a condição é sobre a proposta
          // **dele**.
          eq(minhaProposta.status, 'aceita'),
        ),
      ),
    )
    .orderBy(desc(oportunidades.createdAt))
    .limit(limite)

  const anexos = await anexosDasOportunidades(linhas.map(({ id }) => id))
  const negociacoes = await obterNegociacoes(
    linhas.map((linha) => linha.propostaId).filter((id): id is string => !!id),
  )

  return linhas.map((linha) => {
    const venceu = linha.propostaStatus === 'aceita'
    return {
      id: linha.id,
      categoria: linha.categoria,
      especialidades: linha.especialidades ?? [],
      titulo: linha.titulo,
      descricao: linha.descricao,
      abrangencia: linha.abrangencia,
      valorPretendidoCentavos: linha.valorPretendidoCentavos,
      status: linha.status,
      visibilidade: linha.visibilidade,
      // Redundante com `visibilidade` só na aparência: a consulta já garantiu
      // que uma privada só chega ao destinatário, então a tela pode dizer
      // "enviada diretamente para você" sem comparar id nenhum no navegador.
      direcionadaAMim: linha.visibilidade === 'privada',
      criadoEm: linha.criadoEm.toISOString(),
      expiraEm: linha.expiraEm?.toISOString() ?? null,
      clienteNome: linha.clienteNome,
      // Só o vencedor sabe que houve pagamento e qual protocolo nasceu. Para
      // qualquer outro prestador estes campos são nulos, sempre.
      pagoEm: venceu ? (linha.pagamentoEm?.toISOString() ?? null) : null,
      valorPagoCentavos: venceu ? (linha.pagamentoValor ?? null) : null,
      atendimento:
        venceu && linha.atendimentoId && linha.atendimentoProtocolo
          ? { id: linha.atendimentoId, protocolo: linha.atendimentoProtocolo }
          : null,
      // Dispensada continua na lista, e não some: o prestador precisa poder ver
      // o que tirou da fila — e mudar de ideia enviando proposta.
      dispensada: linha.dispensadaEm !== null,
      anexos: anexos.get(linha.id) ?? [],
      minhaProposta: linha.propostaId
        ? {
            id: linha.propostaId,
            mensagem: linha.propostaMensagem ?? '',
            valorCentavos: linha.propostaValorCentavos ?? null,
            prazoEstimadoDias: linha.propostaPrazo ?? null,
            status: linha.propostaStatus ?? 'enviada',
            criadoEm: (linha.propostaCriadoEm ?? linha.criadoEm).toISOString(),
            validaAte: linha.propostaValidaAte?.toISOString() ?? null,
            vigente: propostaVigente({
              status: linha.propostaStatus ?? 'enviada',
              validaAte: linha.propostaValidaAte,
            }),
            valorAcordadoCentavos: linha.propostaValorAcordado ?? null,
            aceitaEm: linha.propostaAceitaEm?.toISOString() ?? null,
            contrapropostaPendente:
              negociacoes.get(linha.propostaId)?.pendente ?? null,
            historicoContrapropostas:
              negociacoes.get(linha.propostaId)?.historico ?? [],
          }
        : null,
    }
  })
}

/**
 * Quantas oportunidades ainda esperam **ação deste prestador**.
 *
 * É o número do banner do Dashboard, e é individual por definição: conta o que
 * está aberto, é compatível com ele, ele ainda não respondeu e ele ainda não
 * dispensou. Ana enviar proposta não muda o número de Ricardo, e Ricardo
 * dispensar não tira a oportunidade de Ana — as duas exclusões saem de tabelas
 * por par (oportunidade, prestador), nunca de um estado da oportunidade.
 */
export async function contarOportunidadesDisponiveis(prestadorId: string) {
  return (await contarDisponiveisPorOrigem(prestadorId)).total
}

/**
 * O mesmo número do banner, separado por origem.
 *
 * O destaque do Dashboard precisa poder dizer que **alguma** daquelas
 * solicitações foi dirigida a esta pessoa — é a diferença entre "apareceu
 * trabalho na sua área" e "alguém escolheu você", e ela muda a urgência com que
 * a pessoa responde. Uma consulta só, com um `filter` a mais: contar duas vezes
 * abriria a chance de os dois números discordarem.
 */
export async function contarDisponiveisPorOrigem(
  prestadorId: string,
): Promise<{ total: number; diretas: number }> {
  const vazio = { total: 0, diretas: 0 }
  const perfil = await perfilDoPrestador(prestadorId)
  if (!prestadorHabilitado(perfil)) return vazio

  const categorias = categoriasCompativeisDoPrestador(perfil)
  if (!categorias.length) return vazio

  const [linha] = await db
    .select({
      total: sql<number>`count(*)::int`,
      diretas: sql<number>`count(*) filter (where ${oportunidades.visibilidade} = 'privada')::int`,
    })
    .from(oportunidades)
    .leftJoin(
      oportunidadePropostas,
      and(
        eq(oportunidadePropostas.oportunidadeId, oportunidades.id),
        eq(oportunidadePropostas.prestadorId, prestadorId),
      ),
    )
    .leftJoin(
      oportunidadeDispensas,
      and(
        eq(oportunidadeDispensas.oportunidadeId, oportunidades.id),
        eq(oportunidadeDispensas.prestadorId, prestadorId),
      ),
    )
    .where(
      and(
        condicaoOportunidadeAtiva(),
        inArray(oportunidades.categoria, categorias),
        or(
          eq(oportunidades.visibilidade, 'publica'),
          eq(oportunidades.destinatarioId, prestadorId),
        ),
        isNull(oportunidadePropostas.id),
        isNull(oportunidadeDispensas.id),
      ),
    )

  return { total: linha?.total ?? 0, diretas: linha?.diretas ?? 0 }
}
