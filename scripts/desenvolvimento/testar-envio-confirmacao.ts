/**
 * Teste real do envio de confirmação, usando a função de produção.
 *
 * O destinatário é sempre o endereço informado — não existe desvio de destino.
 * O que este script prova é que o resultado reportado corresponde ao que o
 * provedor de fato respondeu: aceite vira sucesso com id, recusa vira falha.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/testar-envio-confirmacao.ts <destinatario@exemplo.com>
 */
import { randomBytes } from 'node:crypto'
import { enviarEmailConfirmacao } from '../../src/integracoes/email/enviar-confirmacao-email'

const destinatario = process.argv[2]
if (!destinatario) {
  console.error('Informe o destinatário: ... testar-envio-confirmacao.ts alguem@exemplo.com')
  process.exit(1)
}

console.log('EMAIL_FROM:', process.env.EMAIL_FROM)
console.log('destinatário:', destinatario)

const resultado = await enviarEmailConfirmacao({
  destinatario,
  nome: 'Conta de Teste',
  token: randomBytes(32).toString('hex'),
})

console.log('\nresultado:', JSON.stringify(resultado))

if (resultado.sucesso) {
  console.log(`PASS — provedor aceitou o envio para ${destinatario} (id=${resultado.id})`)
} else {
  console.log(
    `FALHA — provedor recusou o envio para ${destinatario} (motivo: ${resultado.motivo}).`,
  )
  console.log('A recusa foi reportada como falha, sem sucesso falso.')
  process.exitCode = 1
}
