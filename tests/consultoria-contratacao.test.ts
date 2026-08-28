import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql as bruto } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, contratacoesServico, usuarios } from '@/db/schema'
import {
  criarExcecao,
  removerExcecao,
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { prepararContratacaoConsultoria } from '@/features/consultorias/actions/contratacao'
import {
  LIMITE_DESCRICAO_CONSULTORIA,
  MENSAGEM_HORARIO_INDISPONIVEL,
  PASSOS_CONTRATACAO,
} from '@/features/consultorias/constants/contratacao'
import {
  contarCaracteres,
  descricaoValida,
  erroDaDescricao,
  excedeuLimite,
  restanteDeCaracteres,
} from '@/features/consultorias/lib/descricao'
import {
  contextoDoPrestador,
  lerContexto,
  limparContexto,
  salvarContexto,
} from '@/features/consultorias/lib/contexto-contratacao'
import {
  dataPorExtensoComDiaDaSemana,
  duracaoPorExtenso,
  formatarPreco,
} from '@/features/consultorias/lib/formato'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import type { SelecaoDeConsultoria } from '@/features/consultorias/types/consultoria'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * A etapa "Detalhes" da contratação, do campo até a recusa do servidor.
 *
 * ## O que este arquivo defende
 *
 * Que **nada** é contratado aqui, e que o servidor não acredita no navegador.
 * O modal desenha um resumo; quem decide se aquele horário existe, quanto ele
 * custa e quem pode segui-lo é `prepararContratacaoConsultoria` — e é ela que
 * está sob teste, com sessões reais gravadas em `sessoes_usuario`.
 *
 * ## Por que os cenários de banco usam o relógio de verdade
 *
 * A ação não recebe `agora`: em produção ninguém injeta o tempo, e um teste que
 * injetasse provaria menos do que precisa. Em vez de fixar datas — que
 * envelhecem —, o cenário monta a agenda **a partir de hoje**: a
 * disponibilidade é registrada no dia da semana de daqui a uma semana, distante
 * o bastante da antecedência mínima e perto o bastante do horizonte. Roda igual
 * hoje e daqui a um ano.
 */

const SUFIXO = '@consultoria-contratacao.teste'
const FUSO = 'America/Sao_Paulo'

type Chave = 'profissional' | 'cliente' | 'clientePendente' | 'outroProfissional'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  // Dono da agenda contratada.
  profissional: { perfil: 'profissional', prestador: 'profissional' },
  // Quem pode contratar.
  cliente: { perfil: 'cliente' },
  // Sessão válida, conta ainda não confirmada.
  clientePendente: { perfil: 'cliente' },
  // Profissional autenticado tentando contratar como se fosse Cliente.
  outroProfissional: { perfil: 'profissional', prestador: 'profissional' },
}

const CONFIGURACAO = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
  valorCentavos: 22_500,
  duracaoMinutos: 45,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
/** Data local, dentro da janela e a uma semana de distância do relógio real. */
let dataAlvo: string
let primeiroHorario: string

async function contarLinhas() {
  const [contratacoes] = await db
    .select({ total: bruto<number>`count(*)::int` })
    .from(contratacoesServico)
  const [atendimentosCriados] = await db
    .select({ total: bruto<number>`count(*)::int` })
    .from(atendimentos)
  return { contratacoes: contratacoes.total, atendimentos: atendimentosCriados.total }
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119463')

  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)

  entrarComo(contas.profissional.token)
  const salva = await salvarConsultoria(CONFIGURACAO)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  // O dia inteiro livre no dia da semana do alvo: o cenário não depende de qual
  // dia da semana é hoje.
  const faixas = await salvarDisponibilidades([
    {
      diaSemana: diaDaSemanaDeDataLocal(dataAlvo),
      horaInicio: '08:00',
      horaFim: '18:00',
    },
  ])
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()

  const agenda = await listarHorariosDoDia({
    prestadorId: contas.profissional.id,
    data: dataAlvo,
  })
  if (!agenda.horarios.length) throw new Error('Cenário sem horário disponível.')
  primeiroHorario = agenda.horarios[0].inicio
}, 120_000)

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('campo "O que você deseja tratar na consultoria?"', () => {
  it('conta o que foi digitado, espaços inclusive', () => {
    expect(contarCaracteres('  oi  ')).toBe(6)
    expect(restanteDeCaracteres('abc')).toBe(LIMITE_DESCRICAO_CONSULTORIA - 3)
  })

  it('recusa vazio e recusa só espaços', () => {
    expect(descricaoValida('')).toBe(false)
    expect(descricaoValida('     ')).toBe(false)
    expect(descricaoValida('\n\t  \n')).toBe(false)
  })

  it('aceita texto curto — não existe exigência de tamanho mínimo real', () => {
    expect(descricaoValida('Dúvida sobre INSS')).toBe(true)
    expect(descricaoValida('a')).toBe(true)
  })

  it('aceita exatamente 1000 e recusa 1001', () => {
    expect(descricaoValida('x'.repeat(LIMITE_DESCRICAO_CONSULTORIA))).toBe(true)
    expect(descricaoValida('x'.repeat(LIMITE_DESCRICAO_CONSULTORIA + 1))).toBe(false)
    expect(excedeuLimite('x'.repeat(LIMITE_DESCRICAO_CONSULTORIA))).toBe(false)
    expect(excedeuLimite('x'.repeat(LIMITE_DESCRICAO_CONSULTORIA + 1))).toBe(true)
  })

  it('cala enquanto o campo não foi tocado, mas avisa o excesso na hora', () => {
    expect(erroDaDescricao('', false)).toBeNull()
    expect(erroDaDescricao('', true)).toBeTruthy()
    // Excesso não espera o `blur`: o texto que sobra já está na tela.
    expect(erroDaDescricao('x'.repeat(LIMITE_DESCRICAO_CONSULTORIA + 1), false)).toContain(
      String(LIMITE_DESCRICAO_CONSULTORIA),
    )
  })
})

describe('trilha da contratação', () => {
  it('tem exatamente três passos, e login não é um deles', () => {
    expect(PASSOS_CONTRATACAO).toHaveLength(3)
    expect(PASSOS_CONTRATACAO.map((passo) => passo.rotulo)).toEqual([
      'Detalhes',
      'Pagamento',
      'Concluído',
    ])
    const rotulos = PASSOS_CONTRATACAO.map((passo) => passo.rotulo.toLowerCase())
    expect(rotulos.some((rotulo) => rotulo.includes('login'))).toBe(false)
    expect(rotulos.some((rotulo) => rotulo.includes('entrar'))).toBe(false)
  })
})

describe('formatação do resumo', () => {
  it('mostra preço em real e duração em português', () => {
    // `Intl` separa o símbolo com espaço não separável (U+00A0).
    expect(formatarPreco(18_000).replace(/\u00a0/g, ' ')).toBe('R$ 180,00')
    expect(formatarPreco(22_500).replace(/\u00a0/g, ' ')).toBe('R$ 225,00')
    expect(duracaoPorExtenso(30)).toBe('30 minutos')
    expect(duracaoPorExtenso(45)).toBe('45 minutos')
    expect(duracaoPorExtenso(60)).toBe('1 hora')
    expect(duracaoPorExtenso(90)).toBe('1 hora e 30 minutos')
  })

  it('escreve a data no fuso da agenda, sem deslocar o dia', () => {
    expect(dataPorExtensoComDiaDaSemana('2026-08-31')).toBe(
      'Segunda-feira, 31 de agosto de 2026',
    )
    expect(dataPorExtensoComDiaDaSemana('2026-01-01')).toContain('1 de janeiro de 2026')
  })
})

describe('rascunho preservado durante o login', () => {
  /** `sessionStorage` de mentira: o suficiente para o contrato das funções. */
  function storageFalso(): Storage {
    const mapa = new Map<string, string>()
    return {
      get length() {
        return mapa.size
      },
      clear: () => mapa.clear(),
      getItem: (chave: string) => mapa.get(chave) ?? null,
      key: (indice: number) => [...mapa.keys()][indice] ?? null,
      removeItem: (chave: string) => void mapa.delete(chave),
      setItem: (chave: string, valor: string) => void mapa.set(chave, valor),
    } as Storage
  }

  const selecao: SelecaoDeConsultoria = {
    prestadorId: '11111111-1111-1111-1111-111111111111',
    consultoriaId: '22222222-2222-2222-2222-222222222222',
    titulo: 'Consultoria tributária',
    data: '2026-09-14',
    inicio: '09:00',
    fim: '09:45',
    inicioEm: new Date('2026-09-14T12:00:00Z'),
    fimEm: new Date('2026-09-14T12:45:00Z'),
    timezone: FUSO,
    duracaoMinutos: 45,
    valorCentavos: 22_500,
    modalidade: 'online',
  }

  it('devolve escolha e texto intactos, com as datas ainda sendo datas', () => {
    const storage = storageFalso()
    salvarContexto(storage, { selecao, descricao: 'Rescisão de contrato.' })
    const lido = lerContexto(storage)
    expect(lido?.descricao).toBe('Rescisão de contrato.')
    expect(lido?.selecao.inicioEm).toBeInstanceOf(Date)
    expect(lido?.selecao.inicioEm.toISOString()).toBe(selecao.inicioEm.toISOString())
    expect(lido?.selecao.valorCentavos).toBe(22_500)
  })

  it('não devolve o rascunho de outro Profissional', () => {
    const storage = storageFalso()
    salvarContexto(storage, { selecao, descricao: 'Assunto sensível.' })
    const lido = lerContexto(storage)
    expect(contextoDoPrestador(lido, selecao.prestadorId)).not.toBeNull()
    expect(
      contextoDoPrestador(lido, '33333333-3333-3333-3333-333333333333'),
    ).toBeNull()
  })

  it('some quando limpo e ignora conteúdo corrompido', () => {
    const storage = storageFalso()
    salvarContexto(storage, { selecao, descricao: 'x' })
    limparContexto(storage)
    expect(lerContexto(storage)).toBeNull()

    storage.setItem('vincis_consultoria_contratacao', '{ isto não é json')
    expect(lerContexto(storage)).toBeNull()
  })

  it('não quebra quando o navegador proíbe storage', () => {
    const proibido = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    } as unknown as Storage
    expect(() => salvarContexto(proibido, { selecao, descricao: 'x' })).not.toThrow()
    expect(lerContexto(proibido)).toBeNull()
    expect(() => limparContexto(proibido)).not.toThrow()
  })
})

describe('preparar contratação — quem pode seguir', () => {
  it('visitante sem sessão é mandado para o login, e não recebe erro técnico', async () => {
    sairDaSessao()
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Preciso de orientação sobre rescisão.',
    })
    expect(resultado.situacao).toBe('precisa_entrar')
    expect(JSON.stringify(resultado)).not.toContain('Error')
  })

  it('Cliente autenticado e apto recebe o resumo pronto', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Quero revisar o regime tributário da empresa.',
    })
    sairDaSessao()

    expect(resultado.situacao).toBe('pronto')
    if (resultado.situacao !== 'pronto') return
    expect(resultado.resumo.prestadorId).toBe(contas.profissional.id)
    expect(resultado.resumo.modalidade).toBe('online')
    expect(resultado.resumo.data).toBe(dataAlvo)
    expect(resultado.resumo.inicio).toBe(primeiroHorario)
    expect(resultado.resumo.descricao).toBe(
      'Quero revisar o regime tributário da empresa.',
    )
  })

  it('preço e duração vêm da configuração, nunca do que o navegador mandar', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Assunto qualquer.',
      // Campos plantados de má-fé: a ação nem os declara no schema.
      valorCentavos: 1,
      duracaoMinutos: 5,
      titulo: 'Consultoria de R$ 0,01',
    })
    sairDaSessao()

    expect(resultado.situacao).toBe('pronto')
    if (resultado.situacao !== 'pronto') return
    expect(resultado.resumo.valorCentavos).toBe(CONFIGURACAO.valorCentavos)
    expect(resultado.resumo.duracaoMinutos).toBe(CONFIGURACAO.duracaoMinutos)
    expect(resultado.resumo.titulo).toBe(CONFIGURACAO.titulo)
  })

  it('Profissional autenticado não contrata como se fosse Cliente', async () => {
    entrarComo(contas.outroProfissional.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Tentativa de contratar sendo prestador.',
    })
    sairDaSessao()
    expect(resultado.situacao).toBe('perfil_nao_pode_contratar')
  })

  it('o dono da agenda não contrata a própria consultoria', async () => {
    entrarComo(contas.profissional.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Contratando a mim mesmo.',
    })
    sairDaSessao()
    expect(resultado.situacao).toBe('perfil_nao_pode_contratar')
  })

  it('sessão válida com conta não confirmada não avança, e o texto não manda entrar de novo', async () => {
    await db
      .update(usuarios)
      .set({ emailVerificado: false, emailVerificadoEm: null, whatsappVerificado: false })
      .where(eq(usuarios.id, contas.clientePendente.id))

    entrarComo(contas.clientePendente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Conta ainda não confirmada.',
    })
    sairDaSessao()

    expect(resultado.situacao).toBe('conta_nao_confirmada')
    if (resultado.situacao === 'pronto') return
    expect(resultado.mensagem.toLowerCase()).toContain('confirme')

    await db
      .update(usuarios)
      .set({ emailVerificado: true, emailVerificadoEm: new Date() })
      .where(eq(usuarios.id, contas.clientePendente.id))
  })
})

describe('preparar contratação — o que o servidor revalida', () => {
  it('descrição vazia é recusada no servidor, e não só no componente', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: '     ',
    })
    sairDaSessao()
    expect(resultado.situacao).toBe('dados_invalidos')
  })

  it('horário que não existe na agenda recebe a mensagem de escolher outro', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      // Fora de qualquer faixa: a agenda vai só até as 18h.
      inicio: '23:00',
      descricao: 'Horário inventado.',
    })
    sairDaSessao()

    expect(resultado.situacao).toBe('horario_indisponivel')
    if (resultado.situacao === 'pronto') return
    expect(resultado.mensagem).toBe(MENSAGEM_HORARIO_INDISPONIVEL)
  })

  it('horário perdido entre a escolha e o clique não avança', async () => {
    // O Cliente escolheu, foi entrar, e nesse meio-tempo o Profissional
    // bloqueou o dia inteiro.
    entrarComo(contas.profissional.token)
    const excecao = await criarExcecao({
      data: dataAlvo,
      tipo: 'indisponivel_dia',
      motivo: 'Compromisso pessoal',
    })
    if (!excecao.sucesso) throw new Error(excecao.mensagem)
    sairDaSessao()

    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Voltei do login e o horário sumiu.',
    })
    sairDaSessao()

    expect(resultado.situacao).toBe('horario_indisponivel')
    if (resultado.situacao === 'pronto') return
    expect(resultado.mensagem).toBe(MENSAGEM_HORARIO_INDISPONIVEL)
    // O motivo interno do Profissional não escapa junto com a recusa.
    expect(JSON.stringify(resultado)).not.toContain('Compromisso pessoal')

    entrarComo(contas.profissional.token)
    // A ação recebe o id direto, e não um objeto.
    const removida = await removerExcecao(excecao.dados.id)
    if (!removida.sucesso) throw new Error(removida.mensagem)
    sairDaSessao()
  })

  it('consultoria desativada deixa de ser contratável', async () => {
    entrarComo(contas.profissional.token)
    const desativada = await salvarConsultoria({ ...CONFIGURACAO, ativa: false })
    if (!desativada.sucesso) throw new Error(desativada.mensagem)
    sairDaSessao()

    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Consultoria fora do ar.',
    })
    sairDaSessao()
    expect(resultado.situacao).toBe('horario_indisponivel')

    entrarComo(contas.profissional.token)
    await salvarConsultoria({ ...CONFIGURACAO, ativa: true })
    sairDaSessao()
  })
})

describe('nada é gravado nesta etapa', () => {
  it('preparar não cria contratação nem Atendimento — nem quando dá tudo certo', async () => {
    const antes = await contarLinhas()

    entrarComo(contas.cliente.token)
    const resultado = await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Preparar não é contratar.',
    })
    sairDaSessao()
    expect(resultado.situacao).toBe('pronto')

    const depois = await contarLinhas()
    expect(depois).toEqual(antes)
  })

  it('preparar duas vezes seguidas continua sem gravar nada', async () => {
    const antes = await contarLinhas()
    entrarComo(contas.cliente.token)
    for (let vez = 0; vez < 2; vez += 1) {
      await prepararContratacaoConsultoria({
        prestadorId: contas.profissional.id,
        data: dataAlvo,
        inicio: primeiroHorario,
        descricao: 'Cliquei duas vezes.',
      })
    }
    sairDaSessao()
    expect(await contarLinhas()).toEqual(antes)
  })

  it('selecionar e preparar não ocupa o horário para os outros', async () => {
    entrarComo(contas.cliente.token)
    await prepararContratacaoConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: primeiroHorario,
      descricao: 'Ainda não paguei nada.',
    })
    sairDaSessao()

    // Sem `hold` nesta etapa: o horário continua na agenda pública, à vista de
    // qualquer outro Cliente. Segurar horário é a próxima etapa.
    const agenda = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(agenda.horarios.some((slot) => slot.inicio === primeiroHorario)).toBe(true)
  })
})
