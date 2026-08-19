import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '@/db/connection'
import { atendimentoArquivos } from '@/db/schema'
import { podeAssinarCanal } from '@/features/atendimentos/lib/autorizacao-realtime'
import { obterAcessoAtendimento } from '@/features/atendimentos/lib/autorizacao'
import {
  convidarParaAtendimento,
  responderConvite,
} from '@/features/atendimentos/lib/convites'
import { enviarMensagemNoAtendimento } from '@/features/atendimentos/lib/mensagens'
import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { obterArquivoDoAtendimento } from '@/features/atendimentos/queries/obter-arquivo-do-atendimento'
import { obterResumoDoPainel } from '@/features/atendimentos/queries/painel-do-prestador'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import { interpretarCanal } from '@/integracoes/realtime/canais'
import {
  criarContas,
  limparContas,
  type ContaDeTeste,
  type DefinicaoConta,
} from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O cenário que o teste manual reprovou.
 *
 * Ana tem vários Atendimentos. Ricardo é convidado para **um** deles. A
 * pergunta é simples e vale para toda a tela: o que Ricardo alcança?
 *
 * Cada `it` responde por uma superfície diferente — quadro, contadores,
 * deep-link, arquivo, canal de tempo real —, porque o vazamento anterior era
 * exatamente uma superfície ter uma resposta diferente das outras.
 */
const SUFIXO = '@isolamento-atendimentos.teste'

type Chave = 'ana' | 'ricardo' | 'estranho' | 'marina' | 'paulo'

const DEFINICOES: Record<Chave, DefinicaoConta> = {
  ana: { perfil: 'profissional', prestador: 'profissional' },
  ricardo: { perfil: 'profissional', prestador: 'profissional' },
  estranho: { perfil: 'profissional', prestador: 'profissional' },
  marina: { perfil: 'cliente' },
  paulo: { perfil: 'cliente' },
}

let contas: Record<Chave, ContaDeTeste>
/** Protocolos da Ana. Ricardo entra só no primeiro. */
let compartilhado: string
let reservados: string[]

const SERVICO_BASE = {
  nome: 'Abertura de Empresa',
  descricaoCurta: 'Abertura completa de MEI.',
  descricaoDetalhada: 'Inclui CNPJ e alvará.',
  categoria: 'contabil' as const,
  itensIncluidos: ['CNPJ'],
  checklistModelo: ['Documentos do sócio'],
  modeloPreco: 'fixo' as const,
  valor: '100,00',
  prazoEstimadoDias: 5,
  ativo: true,
  publico: true,
  ordem: 0,
}

/** Um Atendimento da Ana para o Cliente indicado. */
async function criarAtendimento(cliente: Chave) {
  entrarComo(contas.ana.token)
  const servico = await criarServico(SERVICO_BASE)
  if (!servico.sucesso) throw new Error(servico.mensagem)

  entrarComo(contas[cliente].token)
  const contratacao = await contratarServico({
    servicoId: (servico as { dados: { id: string } }).dados.id,
  })
  if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
  sairDaSessao()

  return (contratacao.dados as { atendimentoId: string }).atendimentoId
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119450')

  // Cinco Atendimentos da Ana, com dois Clientes diferentes: a carteira que
  // não pode vazar.
  compartilhado = await criarAtendimento('marina')
  reservados = [
    await criarAtendimento('marina'),
    await criarAtendimento('paulo'),
    await criarAtendimento('paulo'),
    await criarAtendimento('marina'),
  ]

  // Ricardo é convidado para **um** protocolo, e aceita.
  const convite = await convidarParaAtendimento({
    atendimentoId: compartilhado,
    usuarioId: contas.ana.id,
    destinatarioId: contas.ricardo.id,
    escopo: 'Acompanhar a abertura na junta comercial.',
    valorOferecidoCentavos: 50000,
  })
  if (!convite.sucesso) throw new Error(convite.motivo)
  await responderConvite({
    conviteId: convite.id,
    usuarioId: contas.ricardo.id,
    resposta: 'aceitar',
  })
}, 120_000)

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('um convite dá acesso a um protocolo, e só a ele', () => {
  it('o quadro do Ricardo tem exatamente o Atendimento em que ele participa', async () => {
    const quadro = await listarAtendimentosDoPrestador(contas.ricardo.id)
    expect(quadro.map((a) => a.id)).toEqual([compartilhado])
    // Nenhum protocolo da Marina ou do Paulo entra de carona.
    for (const outro of reservados) {
      expect(quadro.map((a) => a.id)).not.toContain(outro)
    }
  })

  it('a Ana continua vendo a carteira inteira', async () => {
    const quadro = await listarAtendimentosDoPrestador(contas.ana.id)
    expect(quadro.map((a) => a.id).sort()).toEqual(
      [compartilhado, ...reservados].sort(),
    )
  })

  it('quem não tem vínculo nenhum vê um quadro vazio', async () => {
    expect(await listarAtendimentosDoPrestador(contas.estranho.id)).toEqual([])
  })

  /**
   * Busca, filtros e paginação leem da mesma lista do quadro. O teste fixa o
   * contrato onde ele importa: a lista que chega ao navegador. Se ela estiver
   * certa, não existe filtro capaz de revelar o que não veio.
   */
  it('a busca do Ricardo não alcança protocolo alheio', async () => {
    const quadro = await listarAtendimentosDoPrestador(contas.ricardo.id)
    const protocolos = quadro.map((a) => a.protocolo)
    const daAna = await listarAtendimentosDoPrestador(contas.ana.id)
    const protocolosReservados = daAna
      .filter((a) => reservados.includes(a.id))
      .map((a) => a.protocolo)

    for (const protocolo of protocolosReservados) {
      expect(protocolos).not.toContain(protocolo)
    }
  })

  it('os contadores do painel contam só o que a pessoa alcança', async () => {
    const resumoRicardo = await obterResumoDoPainel(contas.ricardo.id)
    const resumoAna = await obterResumoDoPainel(contas.ana.id)

    expect(resumoRicardo.atendimentosAtivos).toBe(1)
    expect(resumoAna.atendimentosAtivos).toBe(5)
    expect(await obterResumoDoPainel(contas.estranho.id)).toMatchObject({
      atendimentosAtivos: 0,
      atendimentosNovos: 0,
      mensagensNaoLidas: 0,
    })
  })

  it('deep-link para outro Atendimento é recusado', async () => {
    for (const outro of reservados) {
      expect(await obterAcessoAtendimento(outro, contas.ricardo.id)).toBeNull()
    }
    expect(
      await obterAcessoAtendimento(compartilhado, contas.ricardo.id),
    ).toMatchObject({ vinculo: 'participante' })
  })

  it('arquivo de outro Atendimento é recusado', async () => {
    // Um anexo qualquer num protocolo reservado, gravado direto para não
    // depender do armazenamento externo.
    const [arquivo] = await db
      .insert(atendimentoArquivos)
      .values({
        atendimentoId: reservados[0],
        nome: 'contrato-social.pdf',
        tipoMime: 'application/pdf',
        tamanhoBytes: 1024,
        origem: 'prestador',
        remetenteId: contas.ana.id,
        chave: `teste/${reservados[0]}/contrato-social.pdf`,
      })
      .returning({ id: atendimentoArquivos.id })

    expect(
      await obterArquivoDoAtendimento({
        atendimentoId: reservados[0],
        arquivoId: arquivo.id,
        usuarioId: contas.ricardo.id,
      }),
    ).toBeNull()

    // E nem trocando o id do Atendimento pelo que ele alcança: o arquivo
    // precisa pertencer ao Atendimento pedido.
    expect(
      await obterArquivoDoAtendimento({
        atendimentoId: compartilhado,
        arquivoId: arquivo.id,
        usuarioId: contas.ricardo.id,
      }),
    ).toBeNull()
  })

  it('escrever num Atendimento alheio é recusado no servidor', async () => {
    const resultado = await enviarMensagemNoAtendimento({
      atendimentoId: reservados[1],
      usuarioId: contas.ricardo.id,
      escopo: 'cliente',
      conteudo: 'Tentando falar onde não fui convidado.',
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })
})

describe('canais de tempo real repetem o mesmo recorte', () => {
  it('o canal do Atendimento só é assinável por quem tem vínculo', async () => {
    const doCompartilhado = interpretarCanal(
      `private-atendimento-${compartilhado}`,
    )!
    const doReservado = interpretarCanal(`private-atendimento-${reservados[0]}`)!

    expect(await podeAssinarCanal(doCompartilhado, contas.ricardo.id)).toBe(true)
    expect(await podeAssinarCanal(doReservado, contas.ricardo.id)).toBe(false)
    expect(await podeAssinarCanal(doReservado, contas.ana.id)).toBe(true)
    expect(await podeAssinarCanal(doCompartilhado, contas.estranho.id)).toBe(
      false,
    )
  })

  it('ninguém assina o canal pessoal de outra pessoa', async () => {
    const canalDaAna = interpretarCanal(`private-usuario-${contas.ana.id}`)!
    expect(await podeAssinarCanal(canalDaAna, contas.ana.id)).toBe(true)
    expect(await podeAssinarCanal(canalDaAna, contas.ricardo.id)).toBe(false)
  })

  it('o canal de um convite é das duas pontas, e de mais ninguém', async () => {
    const convite = await convidarParaAtendimento({
      atendimentoId: reservados[2],
      usuarioId: contas.ana.id,
      destinatarioId: contas.estranho.id,
      escopo: 'Parecer sobre a documentação.',
      valorOferecidoCentavos: null,
    })
    if (!convite.sucesso) throw new Error(convite.motivo)

    const canal = interpretarCanal(`private-convite-${convite.id}`)!
    expect(await podeAssinarCanal(canal, contas.ana.id)).toBe(true)
    expect(await podeAssinarCanal(canal, contas.estranho.id)).toBe(true)
    // Ricardo participa de um Atendimento da Ana, mas a negociação dela com
    // outra pessoa não é assunto dele.
    expect(await podeAssinarCanal(canal, contas.ricardo.id)).toBe(false)
  })

  it('nome de canal fora do formato não é interpretado', () => {
    expect(interpretarCanal('atendimento-123')).toBeNull()
    expect(interpretarCanal('private-atendimento-nao-uuid')).toBeNull()
    // Canal público não existe nesta aplicação.
    expect(interpretarCanal('presence-usuario-x')).toBeNull()
  })
})
