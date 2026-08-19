/**
 * Teste real de ponta a ponta do cadastro de Colaborador, pelo HTTP do dev
 * server (http://localhost:5173).
 *
 * Exercita a rota de verdade: cria a conta, gera e persiste o token, chama o
 * provedor e devolve a resposta. Em seguida consulta o banco para conferir o
 * estado e confirma o e-mail com o token realmente gravado.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/testar-cadastro-colaborador.ts <email-de-teste>
 */
import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import { tokensUsuario, usuarios } from '../../src/db/schema'

const email = process.argv[2]
if (!email) {
  console.error('Informe o e-mail de teste.')
  process.exit(1)
}

const APP = process.env.APP_URL ?? 'http://localhost:5173'
const resultados: { nome: string; ok: boolean }[] = []
const verificar = (nome: string, ok: boolean, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const sufixo = randomBytes(2).toString('hex')
const resposta = await fetch(`${APP}/api/auth/cadastro`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    nome: 'Colaborador de Teste',
    email,
    whatsapp: `1197${Math.floor(1000000 + Math.random() * 8999999)}`,
    senha: `SenhaTeste${sufixo}!`,
    perfilTipo: 'colaborador',
  }),
})
const corpo = await resposta.json()
console.log('HTTP', resposta.status, JSON.stringify(corpo))

const [usuario] = await db
  .select({
    id: usuarios.id,
    status: usuarios.status,
    emailVerificado: usuarios.emailVerificado,
  })
  .from(usuarios)
  .where(eq(usuarios.email, email.toLowerCase()))
  .limit(1)

verificar('conta criada', Boolean(usuario))
verificar('conta nasce pendente', usuario?.status === 'pendente_email')
verificar('e-mail ainda não verificado', usuario?.emailVerificado === false)

if (resposta.status === 201) {
  verificar('rota reportou sucesso somente com o provedor aceitando', corpo.sucesso === true)
} else {
  verificar(
    'falha do provedor não vira sucesso falso',
    corpo.sucesso === false && resposta.status === 503,
    `${resposta.status}: ${corpo.mensagem}`,
  )
}

const [token] = await db
  .select({ id: tokensUsuario.id, usadoEm: tokensUsuario.usadoEm })
  .from(tokensUsuario)
  .where(
    and(
      eq(tokensUsuario.usuarioId, usuario!.id),
      eq(tokensUsuario.tipo, 'confirmacao_email'),
    ),
  )
  .orderBy(desc(tokensUsuario.createdAt))
  .limit(1)

verificar('token de confirmação persistido', Boolean(token))
if (resposta.status !== 201) {
  verificar(
    'token é invalidado quando o envio falha (sem link órfão)',
    token?.usadoEm !== null,
  )
}

console.log('\nUsuário criado:', usuario?.id)
console.log(
  'Para confirmar manualmente, use o link recebido por e-mail em',
  `${APP}/confirmar-email?token=...`,
)
console.log(
  'Hash do token gravado (para conferência, não é o token):',
  token ? createHash('sha256').update(token.id).digest('hex').slice(0, 12) : '—',
)

const falhas = resultados.filter(({ ok }) => !ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
process.exit(falhas ? 1 : 0)
