import { sql, type SQL } from 'drizzle-orm'
import { usuarios } from '@/db/schema'

/** Parte de servidor da regra de telefone (a parte pura fica em `telefone.ts`, usada também no cliente). */

/**
 * O valor gravado em `usuarios.whatsapp` corresponde a este número, seja qual
 * for a máscara com que foi salvo (dígitos, com +55 ou com 0 de discagem).
 */
export function condicaoTelefoneIgual(nacional: string): SQL {
  const digitos = sql`regexp_replace(coalesce(${usuarios.whatsapp}, ''), '[^0-9]', '', 'g')`
  return sql`${digitos} in (${nacional}, ${`55${nacional}`}, ${`0${nacional}`})`
}
