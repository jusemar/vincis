'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { TIPOS_META, lerReaisEmCentavos, metaEmDinheiro } from '../constants/campanha'
import {
  cancelarCampanha,
  criarRascunhoDeCampanha,
  editarRascunhoDeCampanha,
  publicarCampanha,
  recalcularCampanhaParaTodos,
  type DadosDaCampanha,
} from '../lib/campanhas'

const ROTA_CAMPANHAS_ADMIN = '/admin/parceiros/campanhas'

/*
  Campanhas do Programa de Parceiros, na Gestão.

  Toda action confere sessão e perfil de Gestor antes de ler a entrada — o
  formulário escondido não protege nada. O tipo de meta é validado contra a
  lista dos que têm motor: meta progressiva e meta combinada são recusadas
  aqui (e pelo `check` do banco), mesmo que alguém forje a requisição.
  Nenhum valor chega pronto: alvo, bônus e pontos são lidos do texto no
  servidor, em inteiros.
*/

const CampanhaSchema = z.object({
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(3, 'O título precisa ter ao menos 3 caracteres.').max(120),
  descricao: z.string().trim().max(280, 'A descrição curta aceita até 280 caracteres.').default(''),
  tipoMeta: z.enum(TIPOS_META, { message: 'Escolha um tipo de meta disponível.' }),
  alvo: z.string().trim().min(1, 'Informe o alvo da meta.'),
  bonus: z.string().trim().default(''),
  pontos: z.string().trim().default(''),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de início.'),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de fim.'),
})

const IdSchema = z.object({ id: z.string().uuid() })

async function gestorDaSessao() {
  const sessao = await obterSessaoServidor()
  return sessao && ehGestorPlataforma(sessao) ? sessao : null
}

function lerInteiro(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').trim()
  return /^\d+$/.test(limpo) ? Number(limpo) : null
}

function paraDados(entrada: z.infer<typeof CampanhaSchema>): DadosDaCampanha | string {
  const emDinheiro = metaEmDinheiro(entrada.tipoMeta)
  const alvo = emDinheiro ? lerReaisEmCentavos(entrada.alvo) : lerInteiro(entrada.alvo)
  if (alvo === null) {
    return emDinheiro
      ? 'Valor-alvo inválido: informe em reais, como 3.000,00.'
      : 'Quantidade-alvo inválida: informe um número inteiro.'
  }
  const bonusCentavos = entrada.bonus ? lerReaisEmCentavos(entrada.bonus) : 0
  if (bonusCentavos === null) return 'Bônus inválido: informe em reais, como 150,00.'
  const pontos = entrada.pontos ? lerInteiro(entrada.pontos) : 0
  if (pontos === null) return 'Pontos inválidos: informe um número inteiro.'
  return {
    titulo: entrada.titulo,
    descricao: entrada.descricao,
    tipoMeta: entrada.tipoMeta,
    alvo,
    bonusCentavos,
    pontos,
    inicio: entrada.inicio,
    fim: entrada.fim,
  }
}

function revalidar() {
  revalidatePath(ROTA_CAMPANHAS_ADMIN)
  revalidatePath(ROTA_PARCEIROS, 'layout')
}

/** Cria um rascunho (sem `id`) ou edita um rascunho existente (com `id`). */
export async function salvarRascunhoDeCampanha(entrada: unknown) {
  const sessao = await gestorDaSessao()
  if (!sessao) return SEM_AUTORIZACAO

  const validacao = CampanhaSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Campanha inválida.',
    }
  }
  const dados = paraDados(validacao.data)
  if (typeof dados === 'string') return { sucesso: false as const, mensagem: dados }

  const resultado = validacao.data.id
    ? await editarRascunhoDeCampanha(validacao.data.id, dados, sessao.id)
    : await criarRascunhoDeCampanha(dados, sessao.id)
  if (!resultado.ok) return { sucesso: false as const, mensagem: resultado.mensagem }

  revalidar()
  return {
    sucesso: true as const,
    mensagem: validacao.data.id ? 'Rascunho atualizado.' : 'Rascunho criado. Revise e publique quando estiver pronto.',
    dados: { id: resultado.id },
  }
}

export async function publicarCampanhaDeParceiros(entrada: unknown) {
  const sessao = await gestorDaSessao()
  if (!sessao) return SEM_AUTORIZACAO
  const validacao = IdSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Campanha inválida.' }

  const resultado = await publicarCampanha(validacao.data.id, sessao.id)
  if (!resultado.ok) return { sucesso: false as const, mensagem: resultado.mensagem }
  revalidar()
  return {
    sucesso: true as const,
    mensagem: 'Campanha publicada. A regra está congelada e vale para todos os parceiros ativos.',
  }
}

export async function cancelarCampanhaDeParceiros(entrada: unknown) {
  const sessao = await gestorDaSessao()
  if (!sessao) return SEM_AUTORIZACAO
  const validacao = IdSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Campanha inválida.' }

  const resultado = await cancelarCampanha(validacao.data.id, sessao.id)
  if (!resultado.ok) return { sucesso: false as const, mensagem: resultado.mensagem }
  revalidar()
  return { sucesso: true as const, mensagem: 'Campanha cancelada. Ela não recebe mais progresso.' }
}

/** Reconcilia o progresso de todos os parceiros com os fatos de negócio. */
export async function recalcularProgressoDaCampanha(entrada: unknown) {
  const sessao = await gestorDaSessao()
  if (!sessao) return SEM_AUTORIZACAO
  const validacao = IdSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false as const, mensagem: 'Campanha inválida.' }

  const processados = await recalcularCampanhaParaTodos(validacao.data.id)
  revalidar()
  return {
    sucesso: true as const,
    mensagem: `Progresso recalculado para ${processados} parceiro(s).`,
  }
}
