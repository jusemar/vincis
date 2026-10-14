/**
 * Senha das contas de DESENVOLVIMENTO local (`@vincis.local`).
 *
 * Lida só de `SENHA_CONTAS_LOCAIS` em `.env.local`. O mínimo daqui (8) é uma
 * exceção dos scripts de `scripts/banco-local` para facilitar testes manuais: a
 * política de senha da aplicação (`src/features/usuarios/schemas`) não muda e
 * não é consultada aqui. O teto de 72 bytes é o limite do bcrypt.
 *
 * Importar só depois de `exigirBancoLocal`.
 */
export const DOMINIO_CONTAS_LOCAIS = '@vincis.local'

const MINIMO = 8
const MAXIMO_BYTES_BCRYPT = 72

export function lerSenhaContasLocais(contexto: string): string {
  const senha = process.env.SENHA_CONTAS_LOCAIS
  if (!senha || senha.length < MINIMO || Buffer.byteLength(senha) > MAXIMO_BYTES_BCRYPT) {
    console.error(`${contexto}: defina SENHA_CONTAS_LOCAIS (${MINIMO} a ${MAXIMO_BYTES_BCRYPT} caracteres) em .env.local.`)
    process.exit(1)
  }
  return senha
}
