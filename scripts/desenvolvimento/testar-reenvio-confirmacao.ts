/**
 * Teste real do reenvio de confirmação, chamando o provedor de verdade.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/testar-reenvio-confirmacao.ts <email-da-conta-pendente>
 */
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import { tokensUsuario, usuarios } from '../../src/db/schema'
import { reenviarConfirmacaoEmail } from '../../src/features/usuarios/actions/reenviar-confirmacao-email'

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
  .select({ id: usuarios.id })
  .from(usuarios)
  .where(eq(usuarios.email, email.toLowerCase()))
  .limit(1)

if (!usuario) {
  console.error('Conta não encontrada. Rode antes testar-cadastro-colaborador.ts.')
  process.exit(1)
}

async function tokens() {
  return db
    .select({ usadoEm: tokensUsuario.usadoEm, createdAt: tokensUsuario.createdAt })
    .from(tokensUsuario)
    .where(
      and(
        eq(tokensUsuario.usuarioId, usuario!.id),
        eq(tokensUsuario.tipo, 'confirmacao_email'),
      ),
    )
    .orderBy(desc(tokensUsuario.createdAt))
}

// O cadastro acabou de gerar um token: o limite de 1 minuto deve estar ativo.
const limitado = await reenviarConfirmacaoEmail({ email })
verificar(
  'reenvio imediato é barrado pelo limite de 1 minuto',
  limitado.sucesso === false &&
    limitado.mensagem === 'Aguarde um minuto antes de solicitar outro e-mail.',
  limitado.mensagem,
)

// Envelhece o token para simular a passagem do intervalo permitido.
await db
  .update(tokensUsuario)
  .set({ createdAt: new Date(Date.now() - 2 * 60 * 1000) })
  .where(eq(tokensUsuario.usuarioId, usuario.id))

const antes = await tokens()
const permitido = await reenviarConfirmacaoEmail({ email })
verificar(
  'passado o intervalo, o reenvio chama o provedor e conclui',
  permitido.sucesso === true,
  permitido.mensagem,
)

const depois = await tokens()
verificar('um novo token foi gerado', depois.length === antes.length + 1)
verificar(
  'exatamente um token permanece válido',
  depois.filter(({ usadoEm }) => usadoEm === null).length === 1,
)

const novamenteLimitado = await reenviarConfirmacaoEmail({ email })
verificar(
  'clicar de novo logo em seguida volta a ser barrado',
  novamenteLimitado.sucesso === false,
  novamenteLimitado.mensagem,
)

const falhas = resultados.filter(({ ok }) => !ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
process.exit(falhas ? 1 : 0)
