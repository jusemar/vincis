/**
 * Publica uma tabela de preços fictícia para um prestador, para homologação.
 *
 * ## O que ele faz, e o que deliberadamente não faz
 *
 * Grava o conjunto completo de valores nos dois estados (`rascunho` e
 * `publicado`) e liga a publicação — é o mesmo efeito de abrir
 * `/admin/meus-precos`, preencher tudo e clicar em Publicar. O que ele **não**
 * faz é pular a conferência: os valores passam por
 * `conferirValoresDoProfissional`, a mesma que a Server Action aplica, antes de
 * qualquer linha ser escrita. Um conjunto que a tela recusaria também é
 * recusado aqui.
 *
 * As posições da grade vêm da estrutura da Vincis lida do banco, e não de uma
 * lista escrita aqui: o mapa abaixo só diz **quanto** vale cada posição. Uma
 * chave do mapa que não exista na grade é avisada em vez de ignorada em
 * silêncio.
 *
 * Os números são fictícios e propositalmente diferentes dos da Vincis — é assim
 * que a validação visual consegue distinguir "o preço deste profissional" de
 * "a tabela da casa".
 *
 * ## Um conjunto de números por profissional
 *
 * Os valores ficam em `CONJUNTOS`, nomeados, e `CONJUNTO_POR_EMAIL` diz qual
 * cada conta de homologação recebe. É o que torna a validação do isolamento
 * possível de olho: Ricardo e Ana têm números diferentes em **todas** as
 * posições, então um preço trocado entre eles apareceria na hora.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-precos-profissional-teste.ts \
 *     demo.profissional.ricardo.mendes@vincis.local
 *
 *   # conjunto explícito, para um e-mail fora do mapa:
 *   ... preparar-precos-profissional-teste.ts alguem@exemplo.com --conjunto=premium
 *
 *   # para tirar do ar e apagar o que este script gravou:
 *   ... preparar-precos-profissional-teste.ts <e-mail> --limpar
 */
import { and, eq } from 'drizzle-orm'
import { db, conexaoPostgres } from '../../src/db/connection'
import {
  precificacaoProfissional,
  precificacaoProfissionalValores,
  usuarios,
} from '../../src/db/schema'
import { calcularPreco } from '../../src/features/precificacao/lib/motor'
import { respostasIniciais } from '../../src/features/precificacao/lib/respostas'
import { formatarCentavos } from '../../src/features/precificacao/lib/formato'
import { obterTabelaPrecificacao } from '../../src/features/precificacao/queries/obter-tabela-precificacao'
import { SERVICO_DO_PROFISSIONAL } from '../../src/features/precificacao-profissional/constants/precificacao-profissional'
import { conferirValoresDoProfissional } from '../../src/features/precificacao-profissional/lib/conferencia'
import {
  linhasDosValores,
  valoresDeReferencia,
} from '../../src/features/precificacao-profissional/lib/grade'
import {
  primeiroNomeDe,
  tabelaDoProfissional,
} from '../../src/features/precificacao-profissional/lib/tabela-do-profissional'
import type { ValoresDoProfissional } from '../../src/features/precificacao-profissional/types/precificacao-profissional'

const email = process.argv[2]
const limpar = process.argv.includes('--limpar')
const conjuntoPedido = process.argv
  .find((argumento) => argumento.startsWith('--conjunto='))
  ?.slice('--conjunto='.length)

if (!email) {
  throw new Error(
    'Informe o e-mail do prestador. Ex.: ... preparar-precos-profissional-teste.ts profissiona@teste.com',
  )
}

/* ------------------------------------------------- os números fictícios */

/**
 * Um conjunto é a tabela inteira de um profissional: preço-base por regime
 * (reais), faixas por `tipo/codigo` (reais) e acréscimos por `dimensao/opcao`
 * (porcentagem, zero = resposta neutra).
 */
type Conjunto = {
  descricao: string
  precosBase: Record<string, number>
  faixas: Record<string, number>
  fatores: Record<string, number>
}

const CONJUNTOS: Record<string, Conjunto> = {
  /** O conjunto original de homologação. Acima da tabela da Vincis, de propósito. */
  padrao: {
    descricao: 'referência de homologação',
    precosBase: { mei: 129, simples: 249, presumido: 459, real: 890 },
    faixas: {
      'funcionarios/excedente': 32,
      'notas_fiscais/ate10': 0,
      'notas_fiscais/11a30': 39,
      'notas_fiscais/31a100': 89,
      'notas_fiscais/101a250': 190,
      'notas_fiscais/mais250': 370,
      'faturamento/ate50k': 0,
      'faturamento/50a150k': 79,
      'faturamento/150a500k': 210,
      'faturamento/500ka1m': 390,
      'faturamento/acima1m': 720,
    },
    fatores: {
      'atividade/servicos': 0,
      'atividade/comercio': 10,
      'atividade/industria': 22,
      'atendimento/digital': 0,
      'atendimento/hibrido': 8,
      'atendimento/prioritario': 25,
      'rotina/compartilhado': 0,
      'rotina/vincis': 18,
    },
  },

  /** Escritório enxuto e digital: barato em tudo, e cobra pouco por complexidade. */
  enxuto: {
    descricao: 'escritório enxuto, digital, preço de entrada',
    precosBase: { mei: 99, simples: 189, presumido: 349, real: 690 },
    faixas: {
      'funcionarios/excedente': 25,
      'notas_fiscais/ate10': 0,
      'notas_fiscais/11a30': 29,
      'notas_fiscais/31a100': 69,
      'notas_fiscais/101a250': 145,
      'notas_fiscais/mais250': 280,
      'faturamento/ate50k': 0,
      'faturamento/50a150k': 59,
      'faturamento/150a500k': 160,
      'faturamento/500ka1m': 300,
      'faturamento/acima1m': 550,
    },
    fatores: {
      'atividade/servicos': 0,
      'atividade/comercio': 8,
      'atividade/industria': 18,
      'atendimento/digital': 0,
      'atendimento/hibrido': 6,
      'atendimento/prioritario': 20,
      'rotina/compartilhado': 0,
      'rotina/vincis': 15,
    },
  },

  /** Banca consultiva: caro na base e mais caro ainda quando a rotina é dela. */
  premium: {
    descricao: 'banca consultiva, atendimento próximo, preço premium',
    precosBase: { mei: 179, simples: 329, presumido: 620, real: 1180 },
    faixas: {
      'funcionarios/excedente': 45,
      'notas_fiscais/ate10': 0,
      'notas_fiscais/11a30': 55,
      'notas_fiscais/31a100': 120,
      'notas_fiscais/101a250': 260,
      'notas_fiscais/mais250': 490,
      'faturamento/ate50k': 0,
      'faturamento/50a150k': 110,
      'faturamento/150a500k': 290,
      'faturamento/500ka1m': 520,
      'faturamento/acima1m': 960,
    },
    fatores: {
      'atividade/servicos': 0,
      'atividade/comercio': 14,
      'atividade/industria': 30,
      'atendimento/digital': 0,
      'atendimento/hibrido': 12,
      'atendimento/prioritario': 35,
      'rotina/compartilhado': 0,
      'rotina/vincis': 25,
    },
  },
}

/** Qual conjunto cada conta de homologação recebe. */
const CONJUNTO_POR_EMAIL: Record<string, string> = {
  'profissiona@teste.com': 'padrao',
  'demo.profissional.ricardo.mendes@vincis.local': 'enxuto',
  'demo.profissional.ana.silva@vincis.local': 'premium',
}

const nomeDoConjunto = conjuntoPedido ?? CONJUNTO_POR_EMAIL[email]
if (!nomeDoConjunto) {
  throw new Error(
    `Sem conjunto para ${email}. Escolha um com --conjunto=<nome>: ${Object.keys(CONJUNTOS).join(', ')}.`,
  )
}

const conjunto = CONJUNTOS[nomeDoConjunto]
if (!conjunto) {
  throw new Error(
    `Conjunto "${nomeDoConjunto}" não existe. Disponíveis: ${Object.keys(CONJUNTOS).join(', ')}.`,
  )
}

/* ------------------------------------------------------------- execução */

const [prestador] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.email, email))
  .limit(1)

if (!prestador) throw new Error(`Nenhum usuário com o e-mail ${email}.`)

if (limpar) {
  await db
    .delete(precificacaoProfissionalValores)
    .where(eq(precificacaoProfissionalValores.profissionalId, prestador.id))
  await db
    .delete(precificacaoProfissional)
    .where(eq(precificacaoProfissional.profissionalId, prestador.id))
  console.log(`Preços de ${prestador.nome} removidos. O perfil volta a não oferecer planos.`)
  await conexaoPostgres.end({ timeout: 5 })
  process.exit(0)
}

const estrutura = await obterTabelaPrecificacao()
const referencia = valoresDeReferencia(estrutura)

/** Aplica o mapa sobre as posições reais da grade, avisando o que sobrou. */
function aplicar(
  posicoes: Record<string, number>,
  mapa: Record<string, number>,
  converter: (valor: number) => number,
  rotulo: string,
): Record<string, number> {
  const sobrando = Object.keys(mapa).filter((chave) => !(chave in posicoes))
  if (sobrando.length > 0) {
    console.warn(`  ! ${rotulo}: chaves que não existem na grade: ${sobrando.join(', ')}`)
  }
  const faltando = Object.keys(posicoes).filter((chave) => !(chave in mapa))
  if (faltando.length > 0) {
    console.warn(`  ! ${rotulo}: sem valor fictício, ficando com a referência: ${faltando.join(', ')}`)
  }
  return Object.fromEntries(
    Object.entries(posicoes).map(([chave, atual]) => [
      chave,
      chave in mapa ? converter(mapa[chave]) : atual,
    ]),
  )
}

const valores: ValoresDoProfissional = {
  precosBase: aplicar(
    referencia.precosBase,
    conjunto.precosBase,
    (reais) => Math.round(reais * 100),
    'preço-base',
  ),
  faixas: aplicar(
    referencia.faixas,
    conjunto.faixas,
    (reais) => Math.round(reais * 100),
    'faixas',
  ),
  fatores: aplicar(
    referencia.fatores,
    conjunto.fatores,
    (percentual) => 1000 + Math.round(percentual * 10),
    'fatores',
  ),
}

// A mesma conferência da Server Action: grade completa e preço que pode ir ao ar.
const { problemas, violacoes } = conferirValoresDoProfissional(estrutura, valores)
if (problemas.length > 0 || violacoes.length > 0) {
  console.error('Configuração recusada, nada foi gravado:')
  for (const problema of problemas) console.error(`  - ${problema}`)
  for (const violacao of violacoes) console.error(`  - ${violacao.mensagem}`)
  await conexaoPostgres.end({ timeout: 5 })
  process.exit(1)
}

await db.transaction(async (tx) => {
  await tx
    .insert(precificacaoProfissional)
    .values({ profissionalId: prestador.id })
    .onConflictDoNothing({ target: precificacaoProfissional.profissionalId })

  for (const estado of ['rascunho', 'publicado'] as const) {
    await tx
      .delete(precificacaoProfissionalValores)
      .where(
        and(
          eq(precificacaoProfissionalValores.profissionalId, prestador.id),
          eq(precificacaoProfissionalValores.estado, estado),
        ),
      )
    await tx.insert(precificacaoProfissionalValores).values(
      linhasDosValores(valores).map((linha) => ({
        profissionalId: prestador.id,
        estado,
        tipo: linha.tipo,
        chave: linha.chave,
        valor: linha.valor,
        updatedAt: new Date(),
      })),
    )
  }

  await tx
    .update(precificacaoProfissional)
    .set({ publicado: true, publicadoEm: new Date(), updatedAt: new Date() })
    .where(eq(precificacaoProfissional.profissionalId, prestador.id))
})

/* ---------------------------------------------------- o que ficou no ar */

const primeiroNome = primeiroNomeDe(prestador.nome)
const tabela = tabelaDoProfissional(estrutura, valores, { primeiroNome })

console.log(
  `\nPreços publicados para ${prestador.nome} (${prestador.id}).` +
    `\nConjunto "${nomeDoConjunto}" — ${conjunto.descricao}.\n`,
)
console.log('— preço-base por enquadramento —')
for (const preco of tabela.precosBase) {
  console.log(`  ${preco.regime.padEnd(10)} ${formatarCentavos(preco.valorCentavos)}`)
}

console.log('\n— o que a página pública mostra por perfil —')
const cenarios: [string, Parameters<typeof calcularPreco>[2]][] = [
  ['perfil de abertura da página', respostasIniciais(tabela)],
  [
    'MEI, serviços, sem funcionários',
    {
      regime: 'mei',
      atividades: ['servicos'],
      funcionarios: 0,
      notasFiscais: 'ate10',
      emissor: 'empresa',
      faturamento: 'ate50k',
      atendimento: 'digital',
      rotina: 'compartilhado',
      adicionais: [],
    },
  ],
  [
    'Lucro Real, indústria, 12 funcionários, tudo no máximo',
    {
      regime: 'real',
      atividades: ['industria'],
      funcionarios: 12,
      notasFiscais: 'mais250',
      emissor: 'vincis',
      faturamento: 'acima1m',
      atendimento: 'prioritario',
      rotina: 'vincis',
      adicionais: [],
    },
  ],
]

for (const [nome, respostas] of cenarios) {
  const resultado = calcularPreco(tabela, SERVICO_DO_PROFISSIONAL, respostas)
  console.log(`  ${formatarCentavos(resultado.mensalCentavos).padStart(12)}  ${nome}`)
}

console.log(
  `\nPerfil público:  /perfil-profissional?prestador=${prestador.id}` +
    `\nPlanos e preços: /perfil-profissional/precos?prestador=${prestador.id}\n`,
)

await conexaoPostgres.end({ timeout: 5 })
