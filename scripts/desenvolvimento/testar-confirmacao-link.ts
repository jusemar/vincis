/**
 * Fecha o ciclo: grava um token conhecido para a conta de teste, executa a
 * confirmação real e verifica o estado resultante, inclusive o destino de
 * roteamento do Colaborador.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/testar-confirmacao-link.ts <email-da-conta-pendente>
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import { tokensUsuario, usuarios } from '../../src/db/schema'
import { gerarToken } from '../../src/features/usuarios/lib/gerar-token'
import { confirmarEmail } from '../../src/features/usuarios/actions/confirmar-email'
import { resolverAcessoUsuario } from '../../src/features/usuarios/queries/obter-destino-apos-login'

const email = process.argv[2]
if (!email) {
  console.error('Informe o e-mail da conta pendente.')
  process.exit(1)
}

const resultados: { nome: string; ok: boolean }[] = []
const verificar = (nome: string, ok: boolean, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const [usuario] = await db
  .select({ id: usuarios.id, status: usuarios.status })
  .from(usuarios)
  .where(eq(usuarios.email, email.toLowerCase()))
  .limit(1)

if (!usuario) {
  console.error('Conta não encontrada.')
  process.exit(1)
}

verificar('conta está pendente antes da confirmação', usuario.status === 'pendente_email')
verificar(
  'conta pendente não resolve destino algum',
  (await resolverAcessoUsuario(usuario.id)) === null,
)

// Substitui o token vivo por um de valor conhecido, para simular a abertura do
// link recebido sem precisar ler a caixa de entrada.
const { token, hash } = gerarToken()
await db
  .update(tokensUsuario)
  .set({ tokenHash: hash })
  .where(
    and(
      eq(tokensUsuario.usuarioId, usuario.id),
      eq(tokensUsuario.tipo, 'confirmacao_email'),
      isNull(tokensUsuario.usadoEm),
    ),
  )

const confirmacao = await confirmarEmail({ token })
verificar('confirmação aceita o token', confirmacao.sucesso, confirmacao.mensagem)

const [depois] = await db
  .select({ status: usuarios.status, emailVerificado: usuarios.emailVerificado })
  .from(usuarios)
  .where(eq(usuarios.id, usuario.id))
verificar('conta deixa de ser pendente', depois.status === 'ativo')
verificar('e-mail marcado como verificado', depois.emailVerificado === true)

const reuso = await confirmarEmail({ token })
verificar('o mesmo token não funciona duas vezes', reuso.sucesso === false, reuso.mensagem)

const acesso = await resolverAcessoUsuario(usuario.id)
verificar(
  'Colaborador confirmado segue para /cadastro-colaborador',
  acesso?.destino === '/cadastro-colaborador',
  acesso?.destino,
)

const falhas = resultados.filter(({ ok }) => !ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
process.exit(falhas ? 1 : 0)
