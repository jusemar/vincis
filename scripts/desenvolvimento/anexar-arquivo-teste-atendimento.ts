/**
 * Anexa um arquivo pequeno de verdade ao Atendimento de um Cliente de teste.
 *
 * Usa exatamente a mesma função que a Server Action usa
 * (`anexarArquivoNoAtendimento`): a autorização, o upload para o armazenamento
 * privado, a linha em `atendimento_arquivos` e o evento de histórico são os
 * reais. O script só entrega o arquivo e diz quem está enviando.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/anexar-arquivo-teste-atendimento.ts <email-do-cliente>
 */
import { desc, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import { atendimentoArquivos, atendimentos, usuarios } from '../../src/db/schema'
import { anexarArquivoNoAtendimento } from '../../src/features/atendimentos/lib/anexar-arquivo'

const email = process.argv[2] ?? 'cliente.teste.atendimentos@vincis.local'

const [cliente] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.email, email))
  .limit(1)

if (!cliente) throw new Error(`Cliente ${email} não encontrado.`)

const [atendimento] = await db
  .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
  .from(atendimentos)
  .where(eq(atendimentos.clienteUsuarioId, cliente.id))
  .orderBy(desc(atendimentos.createdAt))
  .limit(1)

if (!atendimento) throw new Error(`Nenhum Atendimento para ${email}.`)

const existentes = await db
  .select({ id: atendimentoArquivos.id, nome: atendimentoArquivos.nome })
  .from(atendimentoArquivos)
  .where(eq(atendimentoArquivos.atendimentoId, atendimento.id))

if (existentes.length) {
  console.log(
    `Atendimento ${atendimento.protocolo} já tem ${existentes.length} arquivo(s): ${existentes
      .map((a) => a.nome)
      .join(', ')}`,
  )
} else {
  const conteudo = 'Documento de teste Vincis\nAtendimento para validação de anexos\n'
  const arquivo = new File([conteudo], 'documento-de-teste.txt', {
    type: 'text/plain',
  })

  const anexado = await anexarArquivoNoAtendimento({
    atendimentoId: atendimento.id,
    usuarioId: cliente.id,
    arquivo,
  })

  console.log(
    `Anexado em ${atendimento.protocolo}: ${anexado.nome} (${anexado.tamanhoBytes} bytes, origem ${anexado.origem}).`,
  )
}

await conexaoPostgres.end({ timeout: 5 })
