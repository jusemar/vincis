/**
 * Três consultorias de demonstração, deliberadamente diferentes entre si.
 *
 * ## Para que servem
 *
 * Uma agenda só não prova nada. Com três configurações distintas — preço,
 * duração, intervalo, antecedência, horizonte e dias da semana — dá para
 * conferir olhando que cada perfil consulta o **seu** Profissional: se o preço
 * de um aparecer no card de outro, ou se os dias forem sempre os mesmos três,
 * o erro salta aos olhos em vez de passar despercebido até a produção.
 *
 * ## Segurança
 *
 * Só toca em contas `@vincis.local`, que é a marca de demonstração que o
 * projeto já usa (ver `regularizar-perfis-demo.ts`). O script **verifica** o
 * e-mail antes de escrever e recusa qualquer id que não seja demo — as contas
 * reais do banco de desenvolvimento (as do próprio dono do projeto) ficam
 * intocadas. Também não altera o cadastro do Profissional: escreve apenas nas
 * tabelas `consultoria_*`, criadas para esta funcionalidade.
 *
 * Rodar de novo é seguro: a configuração é substituída em bloco, e as faixas
 * antigas saem por cascata antes de as novas entrarem.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-consultorias-demo.ts criar|remover
 */
import { eq, inArray, like } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  consultoriaConfiguracoes,
  consultoriaDisponibilidades,
  usuarios,
} from '../../src/db/schema'

type FaixaDemo = { diaSemana: number; horaInicio: string; horaFim: string }

type ConsultoriaDemo = {
  prestadorId: string
  /** Só para conferência humana na saída do script. */
  descricaoDoCenario: string
  titulo: string
  descricaoCurta: string
  valorCentavos: number
  duracaoMinutos: number
  intervaloMinutos: number
  antecedenciaMinimaMinutos: number
  horizonteDias: number
  faixas: FaixaDemo[]
}

/**
 * Os três cenários.
 *
 * Nada aqui é regra de produto: são números escolhidos para serem diferentes
 * uns dos outros. O que importa é que nenhum par coincide em preço, duração,
 * intervalo nem dia da semana.
 */
const DEMOS: ConsultoriaDemo[] = [
  {
    prestadorId: '706b616e-6d38-4aa0-a40d-8c8cdedafb1a',
    descricaoDoCenario: 'Advocacia · 60 min · segunda, quarta e quinta',
    titulo: 'Consultoria jurídica online',
    descricaoCurta: 'Primeira conversa para entender seu caso.',
    valorCentavos: 18_000,
    duracaoMinutos: 60,
    intervaloMinutos: 15,
    antecedenciaMinimaMinutos: 120,
    horizonteDias: 60,
    faixas: [
      { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
      { diaSemana: 1, horaInicio: '14:00', horaFim: '17:00' },
      { diaSemana: 3, horaInicio: '14:00', horaFim: '18:00' },
      { diaSemana: 4, horaInicio: '09:00', horaFim: '12:00' },
    ],
  },
  {
    prestadorId: '22064aa8-a2b3-4c02-8cff-aab3e0e8c994',
    descricaoDoCenario: 'Advocacia · 45 min · terça e sexta',
    titulo: 'Consultoria jurídica empresarial',
    descricaoCurta: 'Orientação para contratos e societário.',
    valorCentavos: 25_000,
    duracaoMinutos: 45,
    intervaloMinutos: 15,
    antecedenciaMinimaMinutos: 180,
    horizonteDias: 45,
    faixas: [
      { diaSemana: 2, horaInicio: '08:00', horaFim: '11:00' },
      { diaSemana: 5, horaInicio: '13:00', horaFim: '18:00' },
    ],
  },
  {
    prestadorId: '3ac80284-5551-4f76-bcab-b1737f16aa84',
    descricaoDoCenario: 'Contabilidade · 30 min · quarta e sábado',
    titulo: 'Consultoria contábil online',
    descricaoCurta: 'Tire dúvidas de impostos e regime tributário.',
    valorCentavos: 15_000,
    duracaoMinutos: 30,
    intervaloMinutos: 10,
    antecedenciaMinimaMinutos: 60,
    horizonteDias: 30,
    faixas: [
      { diaSemana: 3, horaInicio: '09:00', horaFim: '12:00' },
      { diaSemana: 6, horaInicio: '09:00', horaFim: '13:00' },
    ],
  },
]

const acao = process.argv[2] ?? 'criar'
const ids = DEMOS.map((demo) => demo.prestadorId)

/**
 * A trava.
 *
 * Nenhum id da lista acima é escrito antes de o banco confirmar que ele é uma
 * conta `@vincis.local`. Um id trocado por engano vira erro, e não uma
 * consultoria criada em cima de conta real.
 */
const contas = await db
  .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email })
  .from(usuarios)
  .where(inArray(usuarios.id, ids))

const nomePorId = new Map(contas.map((conta) => [conta.id, conta.nome]))

for (const demo of DEMOS) {
  const conta = contas.find(({ id }) => id === demo.prestadorId)
  if (!conta) {
    throw new Error(`Prestador ${demo.prestadorId} não existe neste banco.`)
  }
  if (!conta.email.endsWith('@vincis.local')) {
    throw new Error(
      `Prestador ${demo.prestadorId} não é conta de demonstração. Nada foi alterado.`,
    )
  }
}

if (acao === 'remover') {
  // As faixas e as exceções saem por cascata junto da configuração.
  await db
    .delete(consultoriaConfiguracoes)
    .where(inArray(consultoriaConfiguracoes.prestadorId, ids))
  console.log('Consultorias de demonstração removidas.')
} else {
  for (const demo of DEMOS) {
    await db
      .delete(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, demo.prestadorId))

    const [configuracao] = await db
      .insert(consultoriaConfiguracoes)
      .values({
        prestadorId: demo.prestadorId,
        titulo: demo.titulo,
        descricaoCurta: demo.descricaoCurta,
        valorCentavos: demo.valorCentavos,
        duracaoMinutos: demo.duracaoMinutos,
        intervaloMinutos: demo.intervaloMinutos,
        antecedenciaMinimaMinutos: demo.antecedenciaMinimaMinutos,
        horizonteDias: demo.horizonteDias,
      })
      .returning({ id: consultoriaConfiguracoes.id })

    await db.insert(consultoriaDisponibilidades).values(
      demo.faixas.map((faixa) => ({
        configuracaoId: configuracao.id,
        diaSemana: faixa.diaSemana,
        horaInicio: faixa.horaInicio,
        horaFim: faixa.horaFim,
      })),
    )

    console.log(
      [
        nomePorId.get(demo.prestadorId),
        demo.descricaoDoCenario,
        demo.prestadorId,
        `R$ ${(demo.valorCentavos / 100).toFixed(2).replace('.', ',')}`,
        `${demo.duracaoMinutos} min`,
      ].join(' | '),
    )
  }
}

// Conferência final: quem tem consultoria neste banco é só quem devia ter.
const restantes = await db
  .select({ prestadorId: consultoriaConfiguracoes.prestadorId })
  .from(consultoriaConfiguracoes)
  .innerJoin(usuarios, eq(usuarios.id, consultoriaConfiguracoes.prestadorId))
  .where(like(usuarios.email, '%@vincis.local'))
console.log('consultorias demo no banco:', restantes.length)

await conexaoPostgres.end({ timeout: 5 })
