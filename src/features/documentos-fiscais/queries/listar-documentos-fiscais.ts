import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes, documentosFiscais, documentosFiscaisArquivos, empresas } from '@/db/schema'
import { type OrdemDocumentosFiscais } from '../constants/operacao-fiscal'
import {
  condicaoEscopoDocumentosFiscais,
  type AcessoDocumentosFiscais,
} from '../lib/acesso-documentos-fiscais'
import { normalizarIdentificacaoFiscal } from '../lib/identidade-fiscal'

/**
 * Listagem da Central Fiscal.
 *
 * ## Escopo antes de qualquer filtro
 *
 * A consulta começa em `condicaoEscopoDocumentosFiscais`, que amarra a empresa
 * do acesso já resolvido e, para quem não administra, os clientes a que a pessoa
 * tem acesso interno — a mesma regra do detalhe e do download. Nenhum filtro da
 * tela pode ampliar isso: eles só estreitam.
 *
 * ## Só o que a tabela mostra
 *
 * Nada de itens, tributos, partes ou XML: a listagem lê o cabeçalho vigente de
 * `documentos_fiscais`, que existe justamente para isso. O id do arquivo
 * original vem por subconsulta correlacionada (uma por linha, pelo índice
 * `documento + created_at`), e não por uma consulta por documento — a alternativa
 * seria N+1 só para montar o link de download.
 *
 * ## Ordem e paginação
 *
 * `data de emissão` decrescente, com `created_at` e `id` como desempate
 * determinístico. Documento sem data de emissão (o que ainda não foi
 * interpretado) vai para o fim, mas **aparece**: escondê-lo seria esconder
 * justamente o que precisa de atenção.
 */

export const DOCUMENTOS_FISCAIS_POR_PAGINA = 12

export type FiltrosDocumentosFiscais = {
  pagina: number
  clienteId: string | null
  sentido: string | null
  processamento: string | null
  revisao: string | null
  /** Datas no formato `AAAA-MM-DD`, comparadas contra `data_emissao`. */
  de: string | null
  ate: string | null
  busca: string | null
  /** Só o que precisa de atenção: sem leitura, sem sentido ou sem revisão. */
  atencao: boolean
  ordem: OrdemDocumentosFiscais | null
}

export type DocumentoFiscalDaLista = {
  id: string
  tipo: string | null
  numero: string | null
  serie: string | null
  dataEmissao: string | null
  chaveAcesso: string | null
  clienteId: string | null
  clienteNome: string | null
  emitenteNome: string | null
  emitenteIdentificacao: string | null
  destinatarioNome: string | null
  destinatarioIdentificacao: string | null
  sentido: string | null
  valorTotal: string | null
  statusProcessamento: string
  statusRevisao: string
  situacao: string
  importadoEm: Date
  /** Arquivo XML original, para o link de download autorizado. */
  arquivoId: string | null
  /** O contribuinte deste documento não tem CPF/CNPJ cadastrado. */
  contribuinteSemIdentidade: boolean
}

export type ResumoDocumentosFiscais = {
  total: number
  emitidas: number
  recebidas: number
  naoDeterminadas: number
  comFalha: number
  /** Trabalho a fazer: leitura pronta, revisão humana ainda não. */
  pendentesRevisao: number
}

const arquivoOriginal = sql<string | null>`(
  select ${documentosFiscaisArquivos.id}
  from ${documentosFiscaisArquivos}
  where ${documentosFiscaisArquivos.documentoFiscalId} = ${documentosFiscais.id}
    and ${documentosFiscaisArquivos.tipoArquivo} = 'xml'
    and ${documentosFiscaisArquivos.eventoFiscalId} is null
  order by ${documentosFiscaisArquivos.createdAt}
  limit 1
)`

/** Identidade do contribuinte: a do cliente ou, sem cliente, a do escritório. */
const identidadeDoContribuinte = sql<string | null>`coalesce(${clientes.identificacaoFiscal}, case when ${documentosFiscais.clienteId} is null then ${empresas.identificacaoFiscal} end)`

function condicoesDosFiltros(filtros: FiltrosDocumentosFiscais): SQL[] {
  const condicoes: SQL[] = []
  if (filtros.clienteId === 'sem_cliente') condicoes.push(isNull(documentosFiscais.clienteId)!)
  else if (filtros.clienteId) condicoes.push(eq(documentosFiscais.clienteId, filtros.clienteId))
  if (filtros.sentido === 'nao_determinado') {
    // Documento ainda não interpretado tem sentido nulo: para quem filtra, é a
    // mesma pergunta — "de quem é esta nota?" segue sem resposta.
    condicoes.push(
      or(eq(documentosFiscais.sentido, 'nao_determinado'), isNull(documentosFiscais.sentido))!,
    )
  } else if (filtros.sentido) condicoes.push(eq(documentosFiscais.sentido, filtros.sentido))
  if (filtros.processamento) condicoes.push(eq(documentosFiscais.statusProcessamento, filtros.processamento))
  if (filtros.revisao) condicoes.push(eq(documentosFiscais.statusRevisao, filtros.revisao))
  if (filtros.atencao) {
    // Classificação derivada dos estados que já existem — sem status novo.
    condicoes.push(
      or(
        eq(documentosFiscais.statusProcessamento, 'falhou'),
        isNull(documentosFiscais.sentido),
        eq(documentosFiscais.sentido, 'nao_determinado'),
        eq(documentosFiscais.statusRevisao, 'pendente'),
      )!,
    )
  }
  if (filtros.de) condicoes.push(gte(documentosFiscais.dataEmissao, filtros.de))
  if (filtros.ate) condicoes.push(lte(documentosFiscais.dataEmissao, filtros.ate))

  const busca = filtros.busca?.trim()
  if (busca) {
    const termo = `%${busca}%`
    // Um CPF/CNPJ digitado com máscara procura pelo valor canônico.
    const identificacao = normalizarIdentificacaoFiscal(busca)
    const chave = busca.toUpperCase()
    condicoes.push(
      or(
        ilike(documentosFiscais.numero, termo),
        ilike(documentosFiscais.emitenteNome, termo),
        ilike(documentosFiscais.destinatarioNome, termo),
        ilike(documentosFiscais.chaveAcesso, `%${chave}%`),
        ...(identificacao
          ? [
              ilike(documentosFiscais.emitenteIdentificacao, `%${identificacao}%`),
              ilike(documentosFiscais.destinatarioIdentificacao, `%${identificacao}%`),
            ]
          : []),
      )!,
    )
  }
  return condicoes
}

/**
 * Ordem da listagem, sempre no banco e sempre determinística: o critério
 * escolhido, depois a importação e, por fim, o id — sem isso duas páginas
 * poderiam repetir ou perder uma linha com valores empatados.
 */
function ordenacao(ordem: OrdemDocumentosFiscais | null) {
  const desempate = [desc(documentosFiscais.createdAt), asc(documentosFiscais.id)]
  switch (ordem) {
    case 'emissao_asc':
      return [sql`${documentosFiscais.dataEmissao} asc nulls last`, ...desempate]
    case 'importacao_desc':
      return [desc(documentosFiscais.createdAt), asc(documentosFiscais.id)]
    case 'valor_desc':
      return [sql`${documentosFiscais.valorTotal} desc nulls last`, ...desempate]
    case 'valor_asc':
      return [sql`${documentosFiscais.valorTotal} asc nulls last`, ...desempate]
    default:
      // Documento sem emissão (o que ainda não foi lido) vai para o fim, mas aparece.
      return [sql`${documentosFiscais.dataEmissao} desc nulls last`, ...desempate]
  }
}

export async function listarDocumentosFiscais(
  acesso: AcessoDocumentosFiscais,
  filtros: FiltrosDocumentosFiscais,
) {
  const where = and(
    condicaoEscopoDocumentosFiscais(acesso),
    isNull(documentosFiscais.excluidoEm),
    ...condicoesDosFiltros(filtros),
  )
  const pagina = Math.max(1, filtros.pagina)
  const offset = (pagina - 1) * DOCUMENTOS_FISCAIS_POR_PAGINA

  const [documentos, [totais]] = await Promise.all([
    db
      .select({
        id: documentosFiscais.id,
        tipo: documentosFiscais.tipo,
        numero: documentosFiscais.numero,
        serie: documentosFiscais.serie,
        dataEmissao: documentosFiscais.dataEmissao,
        chaveAcesso: documentosFiscais.chaveAcesso,
        clienteId: documentosFiscais.clienteId,
        clienteNome: clientes.nome,
        emitenteNome: documentosFiscais.emitenteNome,
        emitenteIdentificacao: documentosFiscais.emitenteIdentificacao,
        destinatarioNome: documentosFiscais.destinatarioNome,
        destinatarioIdentificacao: documentosFiscais.destinatarioIdentificacao,
        sentido: documentosFiscais.sentido,
        valorTotal: documentosFiscais.valorTotal,
        statusProcessamento: documentosFiscais.statusProcessamento,
        statusRevisao: documentosFiscais.statusRevisao,
        situacao: documentosFiscais.situacao,
        importadoEm: documentosFiscais.createdAt,
        arquivoId: arquivoOriginal,
        contribuinteSemIdentidade: sql<boolean>`${identidadeDoContribuinte} is null`,
      })
      .from(documentosFiscais)
      .leftJoin(clientes, eq(clientes.id, documentosFiscais.clienteId))
      .leftJoin(empresas, eq(empresas.id, documentosFiscais.empresaId))
      .where(where)
      .orderBy(...ordenacao(filtros.ordem))
      .limit(DOCUMENTOS_FISCAIS_POR_PAGINA)
      .offset(offset),
    // O resumo respeita exatamente o mesmo escopo e os mesmos filtros.
    db
      .select({
        total: count(),
        emitidas: sql<number>`count(*) filter (where ${documentosFiscais.sentido} = 'emitido')::int`,
        recebidas: sql<number>`count(*) filter (where ${documentosFiscais.sentido} = 'recebido')::int`,
        naoDeterminadas: sql<number>`count(*) filter (where ${documentosFiscais.sentido} is null or ${documentosFiscais.sentido} = 'nao_determinado')::int`,
        comFalha: sql<number>`count(*) filter (where ${documentosFiscais.statusProcessamento} = 'falhou')::int`,
        pendentesRevisao: sql<number>`count(*) filter (where ${documentosFiscais.statusRevisao} = 'pendente')::int`,
      })
      .from(documentosFiscais)
      .leftJoin(clientes, eq(clientes.id, documentosFiscais.clienteId))
      .where(where),
  ])

  const total = totais?.total ?? 0
  return {
    documentos: documentos as DocumentoFiscalDaLista[],
    resumo: {
      total,
      emitidas: totais?.emitidas ?? 0,
      recebidas: totais?.recebidas ?? 0,
      naoDeterminadas: totais?.naoDeterminadas ?? 0,
      comFalha: totais?.comFalha ?? 0,
      pendentesRevisao: totais?.pendentesRevisao ?? 0,
    } satisfies ResumoDocumentosFiscais,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / DOCUMENTOS_FISCAIS_POR_PAGINA)),
  }
}

/**
 * Contribuintes que aparecem no filtro: só os que têm documento dentro do
 * escopo de quem está olhando — a lista não revela cliente que a pessoa não vê.
 */
export async function listarContribuintesComDocumentos(acesso: AcessoDocumentosFiscais) {
  const linhas = await db
    .selectDistinct({
      clienteId: documentosFiscais.clienteId,
      nome: clientes.nome,
      identificacaoFiscal: clientes.identificacaoFiscal,
    })
    .from(documentosFiscais)
    .leftJoin(clientes, eq(clientes.id, documentosFiscais.clienteId))
    .where(and(condicaoEscopoDocumentosFiscais(acesso), isNull(documentosFiscais.excluidoEm)))
    .orderBy(asc(clientes.nome))

  return linhas.map((linha) => ({
    id: linha.clienteId,
    nome: linha.nome,
    identificacaoFiscal: linha.identificacaoFiscal,
  }))
}
