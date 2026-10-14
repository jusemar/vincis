/**
 * Aplica `SENHA_CONTAS_LOCAIS` a TODAS as contas `@vincis.local` do banco LOCAL.
 *
 * Trocar a variável não muda as contas que já existem: o hash antigo continua no
 * banco. Este comando regrava explicitamente só `senha_hash` (e `updated_at`) de
 * quem ainda não confere com a senha atual — nome, perfis, verificações,
 * sessões e demais vínculos ficam como estão. Contas de outros domínios nunca
 * são tocadas.
 *
 * Só roda contra banco local (guarda). Idempotente: rodar de novo não regrava
 * quem já está com a senha atual.
 *
 * Uso: npm run db:local:senhas
 */
import { exigirBancoLocal } from './guarda'
import { DOMINIO_CONTAS_LOCAIS, lerSenhaContasLocais } from './senha-contas-locais'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:senhas')
const senha = lerSenhaContasLocais('db:local:senhas')

const { eq, like } = await import('drizzle-orm')
const { conexaoPostgres, db } = await import('../../src/db/connection')
const { usuarios } = await import('../../src/db/schema')
const { compararHash, gerarHash } = await import('../../src/features/usuarios/lib/hash-senha')

try {
  const contas = await db
    .select({ id: usuarios.id, email: usuarios.email, senhaHash: usuarios.senhaHash })
    .from(usuarios)
    .where(like(usuarios.email, `%${DOMINIO_CONTAS_LOCAIS}`))
    .orderBy(usuarios.email)

  // O filtro do banco é `like`; a conferência exata do sufixo fica aqui também,
  // para que nenhum e-mail fora do domínio local passe por acidente.
  const locais = contas.filter((conta) => conta.email.endsWith(DOMINIO_CONTAS_LOCAIS))
  const novoHash = await gerarHash(senha)
  let atualizadas = 0
  for (const conta of locais) {
    if (conta.senhaHash && (await compararHash(senha, conta.senhaHash))) continue
    await db.update(usuarios).set({ senhaHash: novoHash, updatedAt: new Date() }).where(eq(usuarios.id, conta.id))
    atualizadas += 1
    console.log(`senha atualizada: ${conta.email}`)
  }
  console.log(`\n${locais.length} conta(s) ${DOMINIO_CONTAS_LOCAIS}; ${atualizadas} atualizada(s), ${locais.length - atualizadas} já conferiam.`)
} finally {
  await conexaoPostgres.end({ timeout: 5 })
}
