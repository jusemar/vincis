'use server'

import { and, eq, like, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { conhecimentoCategorias } from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { gerarIdentificador } from '@/features/cms/nucleo/lib/identificador'
import { registrarEventoConhecimento } from '../lib/auditoria'
import { obterModeradorDaSessao } from '../lib/autorizacao'
import { SEM_PERMISSAO, respostaDeErro, type RespostaAcao } from '../lib/respostas'
import { revalidarConhecimento } from '../lib/revalidacao'
import { categoriaSchema, identificadorSchema } from '../schemas/artigo'

/**
 * Categorias da Central — só a Gestão. Sem exclusão: desativar tira a
 * categoria dos filtros públicos e do formulário, sem invalidar artigos que já
 * a usam. O slug nasce do nome e não muda (é parte de `?categoria=`).
 */

async function slugDeCategoriaLivre(nome: string): Promise<string> {
  const base = gerarIdentificador(nome).slice(0, 70).replace(/-+$/g, '') || 'categoria'
  const linhas = await db
    .select({ slug: conhecimentoCategorias.slug })
    .from(conhecimentoCategorias)
    .where(or(eq(conhecimentoCategorias.slug, base), like(conhecimentoCategorias.slug, `${base}-%`)))
  const ocupados = new Set(linhas.map(({ slug }) => slug))
  if (!ocupados.has(base)) return base
  let numero = 2
  while (ocupados.has(`${base}-${numero}`)) numero += 1
  return `${base}-${numero}`
}

const salvarSchema = z.object({ categoriaId: identificadorSchema.nullable().optional(), dados: categoriaSchema })

export async function salvarCategoriaConhecimento(entrada: unknown): Promise<RespostaAcao<{ categoriaId: string }>> {
  const gestor = await obterModeradorDaSessao()
  if (!gestor) return SEM_PERMISSAO
  const validacao = salvarSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar categoria')
  const { categoriaId, dados } = validacao.data
  try {
    let id = categoriaId ?? null
    if (id) {
      const [atualizada] = await db
        .update(conhecimentoCategorias)
        .set({ ...dados, updatedAt: new Date() })
        .where(and(eq(conhecimentoCategorias.id, id)))
        .returning({ id: conhecimentoCategorias.id })
      if (!atualizada) return { sucesso: false, mensagem: 'Categoria não encontrada.' }
    } else {
      const [criada] = await db
        .insert(conhecimentoCategorias)
        .values({ ...dados, slug: await slugDeCategoriaLivre(dados.nome) })
        .returning({ id: conhecimentoCategorias.id })
      id = criada.id
    }
    await registrarEventoConhecimento({
      acao: ACOES_AUDITORIA.conhecimentoCategoriaAlterada,
      entidade: 'conhecimento_categoria',
      registroAfetado: id,
      autorId: gestor.id,
      origem: 'gestao_vincis',
      metadados: { operacao: categoriaId ? 'editada' : 'criada', nome: dados.nome, ativa: dados.ativa },
    })
    revalidarConhecimento()
    return { sucesso: true, mensagem: categoriaId ? 'Categoria atualizada.' : 'Categoria criada.', categoriaId: id }
  } catch (erro) {
    return respostaDeErro(erro, 'salvar categoria')
  }
}
