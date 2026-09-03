import type {
  DimensaoPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import {
  ARREDONDAMENTO_DO_PROFISSIONAL,
  GRUPO_DO_PROFISSIONAL,
  NOME_DO_SERVICO,
  PERIODO_DO_PROFISSIONAL,
  SERVICO_DO_PROFISSIONAL,
} from '../constants/precificacao-profissional'
import type { ValoresDoProfissional } from '../types/precificacao-profissional'
import { chaveDaFaixa, chaveDoFator } from './grade'

/**
 * `motor + configuração do Profissional = preço do Profissional`.
 *
 * ## A ideia inteira do recurso está nesta função
 *
 * O motor de `features/precificacao/lib/motor.ts` é uma função pura sobre uma
 * `TabelaPrecificacao`. Ele não sabe de onde a tabela veio, não conhece
 * `/precos` e não fala com o banco. Isso quer dizer que **precificar um
 * Profissional não exige motor nenhum novo** — exige uma tabela nova. É o que
 * esta função monta.
 *
 * O motor ganhou depois uma capacidade que a Vincis não usa: uma opção pode
 * somar um valor fixo em vez de multiplicar (`acrescimoCentavos`). É uma forma
 * a mais de cobrar dentro do mesmo passo da conta, e não um caminho paralelo —
 * continua não existindo cálculo de preço fora de `motor.ts`.
 *
 * ```
 * motor + tabela lida de precificacao_*        = preço Vincis
 * motor + tabelaDoProfissional(estrutura, A)   = preço do Profissional A
 * motor + tabelaDoProfissional(estrutura, B)   = preço do Profissional B
 * ```
 *
 * ## Estrutura emprestada, números próprios
 *
 * `estrutura` é a tabela da Vincis, e dela vem só o **desenho**: quais regimes
 * existem, onde cada faixa começa e termina, quais perguntas o configurador faz
 * e em que ordem. Nenhum valor da Vincis sobrevive à derivação — preço-base,
 * faixa e fator são todos substituídos pelos do Profissional. Emprestar o
 * desenho é o que garante que a grade individual não tenha buraco entre faixas
 * nem regime sem preço: essas propriedades já foram conferidas na leitura da
 * tabela da Vincis, e a derivação não mexe em nenhuma delas.
 *
 * ## O que a versão do Profissional deliberadamente não tem
 *
 * Um serviço só, e ele é a contabilidade mensal. Sem Padrão contra Consultiva,
 * sem Jurídico, sem Pacote, sem adicionais, sem semestral, sem anual, sem
 * parcelamento e sem desconto por prazo. Nada disso é removido por condicional
 * dentro do motor: simplesmente **não está na tabela** que ele recebe. O motor
 * calcula o que encontra, e aqui ele encontra uma pergunta só — quanto este
 * profissional cobra por mês para cuidar da contabilidade desta empresa.
 *
 * O grupo é `contabil` porque é a família de rotina que o Profissional executa;
 * a grade `juridico` não entra na derivação, e por isso nenhuma faixa ou preço
 * dela pode influenciar o resultado.
 */
export function tabelaDoProfissional(
  estrutura: TabelaPrecificacao,
  valores: ValoresDoProfissional,
  contexto: { primeiroNome: string },
): TabelaPrecificacao {
  const rotulos = rotulosDoProfissional(contexto.primeiroNome)

  return {
    // Um serviço, com o nome da pergunta que o cliente veio fazer. O código
    // reaproveitado é o de um serviço conhecido do motor; o nome não é o dele.
    servicos: [
      {
        codigo: SERVICO_DO_PROFISSIONAL,
        nome: NOME_DO_SERVICO,
        chamada:
          'Rotinas contábeis, fiscais e trabalhistas da empresa conduzidas por este profissional, com valor calculado a partir do perfil informado.',
        grupoBase: GRUPO_DO_PROFISSIONAL,
        // 1,000×: o preço-base do Profissional já é o preço final da rotina.
        // Não há um segundo plano do qual este derive.
        multiplicadorMilesimos: 1000,
        componentes: [],
        destaque: true,
        ordem: 1,
        ativo: true,
      },
    ],

    precosBase: Object.entries(valores.precosBase).map(([regime, valorCentavos]) => ({
      grupo: GRUPO_DO_PROFISSIONAL,
      regime,
      valorCentavos,
    })),

    // As perguntas do configurador, na ordem da Vincis, restritas às que valem
    // para a rotina contábil. O que muda é o multiplicador de cada resposta —
    // e o rótulo, onde ele nomeava a Vincis.
    dimensoes: estrutura.dimensoes
      .filter((dimensao) => dimensao.aplicaAGrupos.includes(GRUPO_DO_PROFISSIONAL))
      .map((dimensao) => aplicarFatores(dimensao, valores, rotulos)),

    faixas: estrutura.faixas
      .filter((faixa) => faixa.grupo === GRUPO_DO_PROFISSIONAL)
      .map((faixa) => ({
        ...faixa,
        valorCentavos:
          valores.faixas[chaveDaFaixa(faixa.tipo, faixa.codigo)] ??
          faixa.valorCentavos,
      })),

    // Sem adicionais: o Profissional vende a contabilidade mensal, e nada por
    // cima dela.
    adicionais: [],

    // Um período, sem desconto — é assim que "não existe semestral, anual nem
    // desconto por prazo" vira configuração em vez de exceção no motor.
    descontos: [
      {
        codigo: PERIODO_DO_PROFISSIONAL,
        tipo: 'periodo',
        rotulo: 'Mensal',
        meses: 1,
        servicoCodigo: null,
        descontoMilesimos: 0,
        ordem: 1,
      },
    ],

    parametros: {
      arredondamentoCentavos: ARREDONDAMENTO_DO_PROFISSIONAL,
      funcionariosPadrao: estrutura.parametros.funcionariosPadrao,
    },
  }
}

/**
 * As respostas de uma pergunta, com o acréscimo do Profissional.
 *
 * Opção que não multiplicava nada na Vincis continua não multiplicando: o
 * `null` do regime e do emissor é informação, não campo vazio. Gravar 1000
 * neles esconderia a diferença entre "esta resposta é neutra" e "esta resposta
 * decide outra coisa".
 *
 * ## Porcentagem ou reais, nunca os dois
 *
 * Uma opção com valor em `acrescimosFixos` chega ao motor com
 * `multiplicadorMilesimos: null` e `acrescimoCentavos` preenchido — assim a
 * tabela derivada **afirma** qual das duas formas vale, em vez de deixar as
 * duas preenchidas e o motor escolher. O percentual daquela opção continua
 * gravado no conjunto de valores, fora da tabela: ele é o que volta a valer no
 * dia em que a pessoa trocar o seletor de volta.
 */
function aplicarFatores(
  dimensao: DimensaoPrecificacao,
  valores: ValoresDoProfissional,
  rotulos: Record<string, { rotulo?: string; ajuda?: string }>,
): DimensaoPrecificacao {
  return {
    ...dimensao,
    // A tabela individual tem um grupo só; declarar os dois faria a dimensão
    // afirmar que vale para uma grade que esta tabela não contém.
    aplicaAGrupos: [GRUPO_DO_PROFISSIONAL],
    opcoes: dimensao.opcoes.map((opcao) => {
      const chave = chaveDoFator(dimensao.codigo, opcao.codigo)
      const substituto = rotulos[chave]
      const acrescimoFixo = valores.acrescimosFixos[chave]
      // Uma opção que nunca multiplicou (regime, emissor) também não passa a
      // cobrar em reais: uma chave solta ali não pode inventar um acréscimo.
      const cobraEmReais =
        opcao.multiplicadorMilesimos !== null && acrescimoFixo !== undefined

      const multiplicadorDoProfissional =
        opcao.multiplicadorMilesimos === null
          ? null
          : (valores.fatores[chave] ?? opcao.multiplicadorMilesimos)

      return {
        ...opcao,
        rotulo: substituto?.rotulo ?? opcao.rotulo,
        ajuda: substituto?.ajuda ?? opcao.ajuda,
        multiplicadorMilesimos: cobraEmReais ? null : multiplicadorDoProfissional,
        acrescimoCentavos: cobraEmReais ? acrescimoFixo : null,
      }
    }),
  }
}

/**
 * Onde o texto da Vincis não pode aparecer na página de outra pessoa.
 *
 * Duas respostas do configurador dizem "Vincis" por escrito: quem emite as
 * notas e quem conduz a rotina. Numa página que é do Profissional, essas frases
 * estariam simplesmente erradas — quem vai emitir e conduzir é ele. O mapa é
 * curto e explícito de propósito: é a lista das frases que precisam ser
 * reescritas, e não um mecanismo genérico de tradução.
 *
 * Os demais rótulos vêm da Vincis sem alteração porque descrevem a empresa do
 * cliente ("Minha empresa", "Simples Nacional", "Comércio") ou a forma de
 * atendimento ("100% digital", "Híbrido") — nenhum deles nomeia a plataforma.
 */
function rotulosDoProfissional(
  primeiroNome: string,
): Record<string, { rotulo?: string; ajuda?: string }> {
  const quem = primeiroNome.trim() || 'o profissional'
  return {
    'emissor/vincis': { rotulo: `${quem} emite para mim` },
    'rotina/vincis': {
      rotulo: `Quero que ${quem} cuide`,
      ajuda: 'Rotina conduzida de ponta a ponta pelo profissional',
    },
    'rotina/compartilhado': {
      ajuda: 'Envio os documentos e acompanho de perto',
    },
  }
}

/**
 * Títulos que vêm antes do nome e não são o nome.
 *
 * Contadores e advogados se cadastram como "Dr. Ricardo Mendes"; sem esta
 * lista, a página perguntaria "Quanto Dr. cobra para cuidar da sua
 * contabilidade". A comparação ignora caixa e o ponto final, então "Dra",
 * "Dra." e "DRA." caem no mesmo lugar.
 */
const TRATAMENTOS = new Set([
  'dr',
  'dra',
  'sr',
  'sra',
  'srta',
  'prof',
  'profa',
])

/**
 * O primeiro nome, que é como a página se dirige ao Profissional.
 *
 * Pula o pronome de tratamento quando ele abre o nome — mas só quando sobra
 * nome depois dele: quem se cadastrou apenas como "Dra." continua sendo
 * chamado assim, que é melhor do que ser chamado de coisa nenhuma.
 */
export function primeiroNomeDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''

  const primeiro = partes[0]
  const semPonto = primeiro.replace(/\.$/, '').toLowerCase()
  if (partes.length > 1 && TRATAMENTOS.has(semPonto)) return partes[1]

  return primeiro
}
