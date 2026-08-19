/**
 * Diagnóstico do provedor de e-mail.
 *
 * Faz uma chamada real ao Resend e imprime a resposta crua, para separar
 * "o código não chamou o provedor" de "o provedor recusou". Nunca imprime a
 * API key — apenas se ela está presente.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/diagnosticar-envio-email.ts destinatario@exemplo.com
 */
import { Resend } from 'resend'

const destinatario = process.argv[2]
if (!destinatario) {
  console.error('Informe o destinatário: ... diagnosticar-envio-email.ts alguem@exemplo.com')
  process.exit(1)
}

const apiKey = process.env.RESEND_API_KEY
const remetente = process.env.EMAIL_FROM

console.log('RESEND_API_KEY presente:', Boolean(apiKey))
console.log('EMAIL_FROM:', remetente)
console.log('APP_URL:', process.env.APP_URL)
console.log('destinatário:', destinatario)

if (!apiKey || !remetente) {
  console.error('Configuração incompleta — o envio nem chega a ser tentado.')
  process.exit(1)
}

const resend = new Resend(apiKey)

const dominios = await resend.domains.list()
console.log('--- DOMÍNIOS VERIFICADOS NA CONTA ---')
console.log(JSON.stringify(dominios.data ?? dominios.error, null, 2))

const { data, error } = await resend.emails.send({
  from: remetente,
  to: destinatario,
  subject: 'Diagnóstico de envio — Vincis',
  text: 'Mensagem de diagnóstico do fluxo de confirmação de e-mail.',
})

console.log('--- RESPOSTA DO PROVEDOR ---')
console.log('data:', JSON.stringify(data))
console.log('error:', JSON.stringify(error, null, 2))
