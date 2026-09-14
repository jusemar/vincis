/**
 * Seed de perfis e permissões, só contra o PostgreSQL LOCAL.
 *
 * Uso: npm run db:seed
 */
import { exigirBancoLocal } from './guarda'

exigirBancoLocal(process.env.DATABASE_URL, 'db:seed')
await import('../../src/db/seed')
