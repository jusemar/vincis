'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { perfisProfissionais } from '@/db/schema'
import { validarGestorVincis } from '../lib/validar-gestor-vincis'
import { AnalisePerfilProfissionalSchema } from '../schemas/analise-perfil-profissional'

/**
 * Campos que o onboarding exige e sem os quais a aprovação não pode ocorrer.
 * Registro e comprovante só valem para o Profissional regulamentado.
 */
async function camposObrigatoriosAusentes(usuarioId: string) {
  const [perfil] = await db
    .select()
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1)
  if (!perfil) return ['cadastro']

  const faltando: string[] = []
  const obrigatorios: [string, string | null][] = [
    ['CEP', perfil.cep],
    ['logradouro', perfil.logradouro],
    ['número', perfil.numero],
    ['bairro', perfil.bairro],
    ['cidade', perfil.cidade],
    ['estado', perfil.estado],
  ]
  for (const [rotulo, valor] of obrigatorios) if (!valor) faltando.push(rotulo)

  const exigeRegistro =
    perfil.tipoPrestador === 'profissional' &&
    perfil.tipoProfissional !== 'especialista_fiscal'
  if (exigeRegistro) {
    if (!perfil.numeroRegistro) faltando.push('registro profissional')
    if (!perfil.comprovanteRegistroChave) faltando.push('comprovante do registro')
  }
  return faltando
}

export async function analisarPerfilProfissional(entrada: { usuarioId: string; decisao: 'aprovado' | 'correcao_solicitada' | 'rejeitado'; mensagem: string }) {
  if (!await validarGestorVincis()) return { sucesso: false, mensagem: 'Operação não autorizada.' }
  const validacao = AnalisePerfilProfissionalSchema.safeParse(entrada)
  if (!validacao.success) return { sucesso: false, mensagem: validacao.error.issues[0]?.message ?? 'Revise os dados informados.' }
  const { usuarioId, decisao, mensagem } = validacao.data

  // Aprovar congela endereço e experiência: depois disso o titular não
  // consegue mais corrigi-los pela tela. Aprovar um cadastro incompleto
  // deixaria a conta presa — foi assim que as contas de demonstração, criadas
  // direto no banco, ficaram impossíveis de salvar.
  if (decisao === 'aprovado') {
    const faltando = await camposObrigatoriosAusentes(usuarioId)
    if (faltando.length) {
      return {
        sucesso: false,
        mensagem: `Não é possível aprovar: o cadastro está sem ${faltando.join(', ')}. Solicite correção ao profissional.`,
      }
    }
  }

  const [atualizado] = await db.update(perfisProfissionais).set({
    statusAnalise: decisao,
    observacaoAnalise: decisao === 'aprovado' ? null : mensagem,
    analisadoEm: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(perfisProfissionais.usuarioId, usuarioId), eq(perfisProfissionais.statusAnalise, 'aguardando_analise'))).returning({ id: perfisProfissionais.id })
  if (!atualizado) return { sucesso: false, mensagem: 'O cadastro não está aguardando análise ou já foi atualizado.' }
  revalidatePath('/admin/usuarios')
  revalidatePath(`/admin/usuarios/${usuarioId}`)
  revalidatePath('/cadastro-profissional')
  return { sucesso: true, mensagem: decisao === 'aprovado' ? 'Cadastro aprovado.' : decisao === 'rejeitado' ? 'Cadastro rejeitado.' : 'Correção solicitada.' }
}

