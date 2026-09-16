import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clientes,
  documentosFiscais,
  documentosFiscaisArquivos,
  documentosFiscaisEventos,
  documentosFiscaisExtracoes,
  documentosFiscaisItens,
  documentosFiscaisPartes,
  documentosFiscaisTributos,
  usuarios,
} from '@/db/schema'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import { resolverAcessoDocumentoFiscal } from '../lib/acesso-documentos-fiscais'

/**
 * Detalhe de um documento fiscal, para a tela de revisão.
 *
 * ## Autorização primeiro, consulta depois
 *
 * `resolverAcessoDocumentoFiscal` resolve usuário → escritório do documento →
 * permissão → acesso ao cliente. Documento inexistente, de outro escritório ou
 * fora do escopo do membro respondem igual: `null`. Nada é lido antes disso.
 *
 * ## Uma extração, nunca duas misturadas
 *
 * Partes, itens e tributos pertencem à extração que os produziu. A tela mostra a
 * **vigente**; as anteriores aparecem só como histórico (método, versão, status,
 * data), sem conteúdo fiscal — juntar linhas de leituras diferentes daria um
 * documento que nunca existiu.
 *
 * ## Sem N+1
 *
 * Seis consultas fixas: documento, extrações, partes, itens, tributos e eventos.
 * Os tributos vêm de uma vez e são agrupados por item em memória; nenhum item
 * dispara consulta própria, por mais itens que a nota tenha.
 */

export type DocumentoFiscalDetalhado = Awaited<ReturnType<typeof obterDocumentoFiscal>>

export async function obterDocumentoFiscal(usuarioId: string, documentoId: string) {
  const acesso = await resolverAcessoDocumentoFiscal(
    usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
    documentoId,
  )
  if (!acesso) return null

  const [documento] = await db
    .select({
      id: documentosFiscais.id,
      empresaId: documentosFiscais.empresaId,
      clienteId: documentosFiscais.clienteId,
      clienteNome: clientes.nome,
      clienteIdentificacao: clientes.identificacaoFiscal,
      tipo: documentosFiscais.tipo,
      origem: documentosFiscais.origem,
      statusProcessamento: documentosFiscais.statusProcessamento,
      statusRevisao: documentosFiscais.statusRevisao,
      situacao: documentosFiscais.situacao,
      sentido: documentosFiscais.sentido,
      chaveAcesso: documentosFiscais.chaveAcesso,
      modelo: documentosFiscais.modelo,
      serie: documentosFiscais.serie,
      numero: documentosFiscais.numero,
      versaoLeiaute: documentosFiscais.versaoLeiaute,
      emitidoEm: documentosFiscais.emitidoEm,
      dataEmissao: documentosFiscais.dataEmissao,
      valorTotal: documentosFiscais.valorTotal,
      valorProdutos: documentosFiscais.valorProdutos,
      valorServicos: documentosFiscais.valorServicos,
      valorDesconto: documentosFiscais.valorDesconto,
      valorFrete: documentosFiscais.valorFrete,
      valorSeguro: documentosFiscais.valorSeguro,
      valorOutrasDespesas: documentosFiscais.valorOutrasDespesas,
      processadoEm: documentosFiscais.processadoEm,
      revisadoEm: documentosFiscais.revisadoEm,
      revisadoPorNome: usuarios.nome,
      importadoEm: documentosFiscais.createdAt,
    })
    .from(documentosFiscais)
    .leftJoin(clientes, eq(clientes.id, documentosFiscais.clienteId))
    .leftJoin(usuarios, eq(usuarios.id, documentosFiscais.revisadoPorId))
    .where(
      and(
        eq(documentosFiscais.id, documentoId),
        eq(documentosFiscais.empresaId, acesso.empresaId),
        isNull(documentosFiscais.excluidoEm),
      ),
    )
    .limit(1)
  if (!documento) return null

  const [extracoes, arquivos, eventos] = await Promise.all([
    db
      .select({
        id: documentosFiscaisExtracoes.id,
        metodo: documentosFiscaisExtracoes.metodo,
        provedor: documentosFiscaisExtracoes.provedor,
        versao: documentosFiscaisExtracoes.versao,
        status: documentosFiscaisExtracoes.status,
        vigente: documentosFiscaisExtracoes.vigente,
        erros: documentosFiscaisExtracoes.erros,
        finalizadaEm: documentosFiscaisExtracoes.finalizadaEm,
        createdAt: documentosFiscaisExtracoes.createdAt,
      })
      .from(documentosFiscaisExtracoes)
      .where(eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId))
      .orderBy(desc(documentosFiscaisExtracoes.createdAt)),
    db
      .select({
        id: documentosFiscaisArquivos.id,
        nomeOriginal: documentosFiscaisArquivos.nomeOriginal,
        tamanhoBytes: documentosFiscaisArquivos.tamanhoBytes,
        sha256: documentosFiscaisArquivos.sha256,
        createdAt: documentosFiscaisArquivos.createdAt,
      })
      .from(documentosFiscaisArquivos)
      .where(
        and(
          eq(documentosFiscaisArquivos.documentoFiscalId, documentoId),
          eq(documentosFiscaisArquivos.tipoArquivo, 'xml'),
          isNull(documentosFiscaisArquivos.eventoFiscalId),
        ),
      )
      .orderBy(asc(documentosFiscaisArquivos.createdAt)),
    db
      .select({
        id: documentosFiscaisEventos.id,
        tipo: documentosFiscaisEventos.tipo,
        codigoEvento: documentosFiscaisEventos.codigoEvento,
        protocolo: documentosFiscaisEventos.protocolo,
        ocorridoEm: documentosFiscaisEventos.ocorridoEm,
        dadosEspecificos: documentosFiscaisEventos.dadosEspecificos,
      })
      .from(documentosFiscaisEventos)
      .where(eq(documentosFiscaisEventos.documentoFiscalId, documentoId))
      .orderBy(asc(documentosFiscaisEventos.ocorridoEm)),
  ])

  const vigente = extracoes.find((extracao) => extracao.vigente) ?? null

  // Sem extração vigente (documento que o parser ainda não leu) não há partes,
  // itens nem tributos para buscar — e inventar zeros seria pior que o vazio.
  const [partes, itens, tributos] = vigente
    ? await Promise.all([
        db
          .select()
          .from(documentosFiscaisPartes)
          .where(eq(documentosFiscaisPartes.extracaoId, vigente.id))
          .orderBy(asc(documentosFiscaisPartes.papel), asc(documentosFiscaisPartes.sequencia)),
        db
          .select()
          .from(documentosFiscaisItens)
          .where(eq(documentosFiscaisItens.extracaoId, vigente.id))
          .orderBy(asc(documentosFiscaisItens.numeroItem)),
        db
          .select()
          .from(documentosFiscaisTributos)
          .where(eq(documentosFiscaisTributos.extracaoId, vigente.id))
          .orderBy(asc(documentosFiscaisTributos.tributo)),
      ])
    : [[], [], []]

  const tributosPorItem = new Map<string, typeof tributos>()
  for (const tributo of tributos) {
    if (!tributo.itemId) continue
    const lista = tributosPorItem.get(tributo.itemId) ?? []
    lista.push(tributo)
    tributosPorItem.set(tributo.itemId, lista)
  }

  return {
    documento,
    emitente: partes.find((parte) => parte.papel === 'emitente') ?? null,
    destinatario: partes.find((parte) => parte.papel === 'destinatario') ?? null,
    outrasPartes: partes.filter((parte) => !['emitente', 'destinatario'].includes(parte.papel)),
    itens: itens.map((item) => ({ ...item, tributos: tributosPorItem.get(item.id) ?? [] })),
    /** Tributos do documento inteiro (totais e retenções declarados no XML). */
    tributosDoDocumento: tributos.filter((tributo) => !tributo.itemId),
    extracaoVigente: vigente,
    historicoExtracoes: extracoes,
    arquivoOriginal: arquivos[0] ?? null,
    eventos,
    permissoes: {
      revisar: Boolean(
        await resolverAcessoDocumentoFiscal(
          usuarioId,
          PERMISSOES_DOCUMENTOS_FISCAIS.revisar,
          documentoId,
        ),
      ),
      baixar: Boolean(
        await resolverAcessoDocumentoFiscal(
          usuarioId,
          PERMISSOES_DOCUMENTOS_FISCAIS.baixar,
          documentoId,
        ),
      ),
    },
  }
}
