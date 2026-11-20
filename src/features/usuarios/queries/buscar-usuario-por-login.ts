import { sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import { normalizarCelularBR } from '../lib/telefone'
import { condicaoTelefoneIgual } from '../lib/telefone-sql'

export type DadosUsuarioLogin = {
  id: string
  nome: string
  email: string | null
  whatsapp: string | null
  senhaHash: string
  status: (typeof usuarios.$inferSelect)['status']
  emailVerificado: boolean
  whatsappVerificado: boolean
}

const colunasLogin = {
  id: usuarios.id,
  nome: usuarios.nome,
  email: usuarios.email,
  whatsapp: usuarios.whatsapp,
  senhaHash: usuarios.senhaHash,
  status: usuarios.status,
  emailVerificado: usuarios.emailVerificado,
  whatsappVerificado: usuarios.whatsappVerificado,
}

/**
 * Conta pelo identificador de login: e-mail (sem diferenciar maiúsculas) ou
 * celular em qualquer máscara. Se o mesmo número aparecer em mais de uma conta
 * (cadastros antigos com máscaras diferentes), o número fica AMBÍGUO e não
 * identifica ninguém — nunca se entra na conta de outra pessoa pelo telefone.
 */
export async function buscarUsuarioPorLogin(emailOuWhatsapp: string): Promise<DadosUsuarioLogin | null> {
  const entrada = emailOuWhatsapp.trim()
  if (entrada.includes('@')) {
    const [conta] = await db
      .select(colunasLogin)
      .from(usuarios)
      .where(sql`lower(${usuarios.email}) = ${entrada.toLowerCase()}`)
      .limit(1)
    return conta ?? null
  }

  const nacional = normalizarCelularBR(entrada)
  if (!nacional) return null
  const contas = await db.select(colunasLogin).from(usuarios).where(condicaoTelefoneIgual(nacional)).limit(2)
  if (contas.length !== 1) {
    if (contas.length > 1) console.warn('[LOGIN] Celular associado a mais de uma conta; identificação recusada.')
    return null
  }
  return contas[0]
}
