import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { servicos } from '@/db/schema'
import { prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import { rotuloAcao, rotuloPreco } from '../lib/formatar-preco'
import type { ModeloPreco } from '../schemas/servico'

export type ServicoVitrine = {
  id: string
  title: string
  description: string
  price: string
  chips: string[]
  cta: string
  priceNote: string
  isOrcamento: boolean
  modeloPreco: ModeloPreco
}

/**
 * Serviços exibidos no perfil público de um prestador.
 *
 * Devolve exatamente o formato que a seção `Serviços disponíveis` já consumia
 * (title/description/price/chips/cta/priceNote/isOrcamento), de modo que trocar
 * mock por banco não exige tocar em uma linha do componente visual.
 *
 * Filtra por prestador + ativo + público e ordena de forma determinística.
 */
export async function listarServicosPublicos(
  prestadorId: string,
): Promise<ServicoVitrine[]> {
  const registros = await db
    .select()
    .from(servicos)
    .where(
      and(
        eq(servicos.prestadorId, prestadorId),
        eq(servicos.ativo, true),
        eq(servicos.publico, true),
      ),
    )
    .orderBy(asc(servicos.ordem), asc(servicos.nome), asc(servicos.id))

  /*
    Advogado: honorário combinado diretamente com o Cliente. O serviço aparece,
    mas sem preço e sem "Contratar agora" — a ação é o pedido de orçamento
    privado que o perfil já tem. O catálogo do advogado não muda no banco.
  */
  const juridico = await prestadorCobraDiretamente(db, prestadorId)

  return registros.map((servico) => {
    if (juridico) {
      return {
        id: servico.id,
        title: servico.nome,
        description: servico.descricaoCurta,
        price: 'Consultar honorários',
        chips: servico.itensIncluidos,
        cta: rotuloAcao('sob_orcamento'),
        priceNote: servico.descricaoDetalhada ?? '',
        isOrcamento: true,
        modeloPreco: 'sob_orcamento' as ModeloPreco,
      }
    }
    const modeloPreco = servico.modeloPreco as ModeloPreco
    return {
      id: servico.id,
      title: servico.nome,
      description: servico.descricaoCurta,
      price: rotuloPreco(modeloPreco, servico.valorCentavos),
      chips: servico.itensIncluidos,
      cta: rotuloAcao(modeloPreco),
      priceNote: servico.descricaoDetalhada ?? '',
      isOrcamento: modeloPreco === 'sob_orcamento',
      modeloPreco,
    }
  })
}
