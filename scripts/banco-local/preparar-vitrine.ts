/**
 * Vitrine pública no banco LOCAL: perfis de teste e endereços amigáveis.
 *
 * 1. Retira da vitrine (sem excluir nada) as contas **inequivocamente de
 *    teste/desenvolvimento**, listadas por e-mail abaixo — nunca por "cadastro
 *    incompleto". A Gestão devolve qualquer uma em Usuários → Vitrine pública.
 * 2. Gera o slug público (`/profissionais/<slug>`) de todo prestador público
 *    que ainda não tem — o mesmo código que o site usa sob demanda.
 *
 * Idempotente. Só roda contra banco local (guarda). Cada perfil ocultado entra
 * na auditoria como `perfil_vitrine_ocultado`, origem `sistema`.
 *
 * Uso: npm run db:local:vitrine
 */
import { exigirBancoLocal } from './guarda'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:vitrine')

const { conexaoPostgres, db } = await import('../../src/db/connection')
const { perfisProfissionais, usuarios } = await import('../../src/db/schema')
const { and, eq, inArray, isNull } = await import('drizzle-orm')
const { ACOES_AUDITORIA, registrarEventoAuditoria } = await import('../../src/features/auditoria/lib/registrar-evento')
const { garantirSlugsDosPrestadores } = await import('../../src/features/perfis/lib/slug-perfil')

/** Contas criadas para teste/desenvolvimento (ver `preparar-contas-teste.ts`). */
const CONTAS_DE_TESTE: Record<string, string> = {
  'profissiona@teste.com': 'Perfil de teste ("Profissional de Teste") — oculto no ambiente local.',
  'gestor.profissional@vincis.local': 'Conta de desenvolvimento (db:local:contas-teste) — oculta da vitrine.',
  'profissional.juridico@vincis.local': 'Conta de desenvolvimento (db:local:contas-teste) — oculta da vitrine.',
}

try {
  const alvos = await db
    .select({ perfilId: perfisProfissionais.id, usuarioId: usuarios.id, email: usuarios.email })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(and(inArray(usuarios.email, Object.keys(CONTAS_DE_TESTE)), isNull(perfisProfissionais.ocultoVitrineEm)))

  for (const alvo of alvos) {
    const motivo = CONTAS_DE_TESTE[alvo.email]
    await db.transaction(async (tx) => {
      await tx
        .update(perfisProfissionais)
        .set({ ocultoVitrineEm: new Date(), motivoOcultacaoVitrine: motivo })
        .where(eq(perfisProfissionais.id, alvo.perfilId))
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.perfilVitrineOcultado,
          entidade: 'perfis_profissionais',
          registroAfetado: alvo.perfilId,
          usuarioId: alvo.usuarioId,
          origem: 'sistema',
          metadados: { motivo, script: 'db:local:vitrine' },
        },
        tx,
      )
    })
    console.log(`  oculto: ${alvo.email}`)
  }
  if (!alvos.length) console.log('  nenhum perfil de teste a ocultar (já ocultos ou inexistentes)')

  const semSlug = await db
    .select({ id: perfisProfissionais.usuarioId })
    .from(perfisProfissionais)
    .where(isNull(perfisProfissionais.slugPublico))
  const slugs = await garantirSlugsDosPrestadores(semSlug.map(({ id }) => id))
  for (const [id, slug] of slugs) console.log(`  slug: ${slug} (${id})`)
  console.log(`\n${slugs.size} slug(s) gerado(s); ${semSlug.length - slugs.size} cadastro(s) não público(s) ficaram sem slug.`)
} finally {
  await conexaoPostgres.end({ timeout: 5 })
}
