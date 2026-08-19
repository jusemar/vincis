/**
 * Histórico completo de envios da conta Resend.
 *
 * É a evidência decisiva sobre "já funcionou para outros endereços?": lista
 * cada mensagem com remetente, destinatário e resultado de entrega. Nenhum
 * segredo é impresso — a API nunca devolve a chave.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/auditar-historico-resend.ts [email-do-dono]
 */
type Email = {
  id: string
  to: string[]
  from: string
  subject: string
  created_at: string
  last_event: string
}

const dono = (process.argv[2] ?? '').toLowerCase()
const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('RESEND_API_KEY ausente.')
  process.exit(1)
}

const resposta = await fetch('https://api.resend.com/emails?limit=100', {
  headers: { authorization: `Bearer ${apiKey}` },
})
const corpo = (await resposta.json()) as { data?: Email[]; has_more?: boolean }
const mensagens = corpo.data ?? []

console.log(`Total de mensagens no histórico: ${mensagens.length}`)
console.log(`has_more: ${corpo.has_more}\n`)

const remetentes = new Map<string, number>()
const destinatarios = new Map<string, { total: number; entregues: number }>()

for (const mensagem of [...mensagens].reverse()) {
  remetentes.set(mensagem.from, (remetentes.get(mensagem.from) ?? 0) + 1)
  for (const destino of mensagem.to) {
    const atual = destinatarios.get(destino) ?? { total: 0, entregues: 0 }
    atual.total += 1
    if (mensagem.last_event === 'delivered') atual.entregues += 1
    destinatarios.set(destino, atual)
  }
  const marca = dono && mensagem.to.some((d) => d.toLowerCase() === dono)
    ? 'DONO    '
    : 'TERCEIRO'
  console.log(
    `${mensagem.created_at}  ${marca}  ${mensagem.last_event.padEnd(10)}  ` +
      `de=${mensagem.from}  para=${mensagem.to.join(',')}`,
  )
}

console.log('\n=== REMETENTES JÁ UTILIZADOS ===')
for (const [remetente, total] of remetentes) console.log(`  ${total}x  ${remetente}`)

console.log('\n=== DESTINATÁRIOS DISTINTOS ===')
for (const [destino, contagem] of destinatarios) {
  const marca = dono && destino.toLowerCase() === dono ? '(dono)' : '(terceiro)'
  console.log(
    `  ${destino} ${marca} — ${contagem.total} envio(s), ${contagem.entregues} entregue(s)`,
  )
}
