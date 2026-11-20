import { sql } from 'drizzle-orm'
import {
  check,
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { empresas } from '../empresas/tabela'
import { usuarioStatusEnum } from '../../enums'

/**
 * Verificação de identidade da conta.
 *
 * São dois métodos independentes e que não se sobrescrevem:
 *
 * - **E-mail**: o próprio usuário clica no link recebido (`email_verificado`).
 * - **WhatsApp**: o Gestor Vincis confirma a identidade pelo número cadastrado
 *   e registra a decisão (`whatsapp_verificado`).
 *
 * Não existe coluna `conta_verificada`: ela é derivada dos dois campos acima
 * (ver `lib/verificacao-conta.ts`). Guardar um terceiro booleano criaria uma
 * fonte de verdade capaz de divergir das outras duas.
 *
 * Confirmar pelo WhatsApp nunca marca o e-mail como verificado — isso seria
 * afirmar um fato que não ocorreu.
 *
 * **Cadastro por celular** (código por SMS): a conta nasce sem e-mail
 * (`email` nulo — nada de e-mail inventado) e com o celular verificado
 * (`whatsapp_verificado`, sem `whatsapp_verificado_por_id`: a posse foi
 * provada pelo próprio código). Toda conta tem e-mail OU celular.
 */
export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').references(() => empresas.id),
  nome: varchar('nome', { length: 255 }).notNull(),
  /** Nulo nas contas criadas só com celular. Único entre as que têm e-mail. */
  email: varchar('email', { length: 255 }).unique(),
  /**
   * E-mail que a conta pediu para adicionar e ainda não confirmou. Só vira
   * `email` quando o link de confirmação é aberto — assim ninguém "reserva" o
   * endereço de outra pessoa.
   */
  emailPendente: varchar('email_pendente', { length: 255 }),
  whatsapp: varchar('whatsapp', { length: 20 }).unique(),
  senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
  emailVerificado: boolean('email_verificado').default(false).notNull(),
  emailVerificadoEm: timestamp('email_verificado_em'),
  whatsappVerificado: boolean('whatsapp_verificado').default(false).notNull(),
  whatsappVerificadoEm: timestamp('whatsapp_verificado_em'),
  // Gestor Vincis responsável pela confirmação manual. Auto-referência: o
  // gestor também é um usuário.
  whatsappVerificadoPorId: uuid('whatsapp_verificado_por_id').references(
    (): AnyPgColumn => usuarios.id,
  ),
  ultimoLoginEm: timestamp('ultimo_login_em'),
  status: usuarioStatusEnum('status').notNull().default('pendente_email'),
  /**
   * Como a pessoa se apresenta em público (autoria de artigos, vitrine).
   *
   * - `pessoal` (padrão): pelo cadastro profissional — profissão, escritório,
   *   especialidades e perfil público.
   * - `equipe_vincis`: integrante da equipe da plataforma (só Gestor). Assina
   *   como "Gestor da Plataforma Vincis · Equipe Vincis", não herda profissão
   *   nem escritório do cadastro de prestador e fica fora da vitrine pública.
   *
   * **Não é permissão.** Perfis (`usuarios_perfis`), capacidades e acesso a
   * áreas continuam vindo das mesmas tabelas de sempre: uma conta de Gestor que
   * também testa os fluxos de prestador mantém tudo.
   */
  identidadePublica: varchar('identidade_publica', { length: 20 }).notNull().default('pessoal'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  identidadePublicaValida: check(
    'usuarios_identidade_publica_valida',
    sql`${t.identidadePublica} in ('pessoal', 'equipe_vincis')`,
  ),
  // Toda conta é alcançável: tem e-mail, celular ou os dois.
  temEmailOuCelular: check('usuarios_email_ou_celular', sql`${t.email} is not null or ${t.whatsapp} is not null`),
}))
