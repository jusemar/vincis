import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoConviteMensagens,
  atendimentoConvites,
  atendimentoEventos,
  atendimentoParticipantes,
  clientes,
  contratacoesServico,
  empresaMembros,
  empresas,
  notificacoes,
  perfis,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import {
  convidarParaAtendimento,
  escreverNaNegociacao,
  marcarNegociacaoComoLida,
  responderConvite,
  revogarConvite,
} from '@/features/atendimentos/lib/convites'
import {
  atribuirMembroDaEquipe,
  removerParticipante,
} from '@/features/atendimentos/lib/participantes'
import { centavosDoTexto, rotuloValorCentavos } from '@/features/atendimentos/lib/valores'
import {
  contarConvitesNovos,
  primeiroConviteNovo,
} from '@/features/atendimentos/lib/pendencias-convite'
import { obterContextoDoConvite } from '@/features/atendimentos/queries/contexto-do-convite'
import {
  listarConvitesDaPessoa,
  listarConvitesDoAtendimento,
} from '@/features/atendimentos/queries/convites-do-atendimento'
import { listarMembrosAtribuiveis } from '@/features/atendimentos/queries/listar-membros-atribuiveis'
import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { obterResumoDoPainel } from '@/features/atendimentos/queries/painel-do-prestador'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { limparAtendimentosDosPrestadores } from './setup/limpeza-atendimentos'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@colaboracao-atendimento.teste'

/**
 * Personas do cenário.
 *
 * `dono` e `membro` estão no mesmo escritório — é o que torna a atribuição
 * direta possível. `externo` é um prestador habilitado sem vínculo nenhum com
 * eles: só entra por convite. `estranho` não toca em nada e existe para provar
 * o isolamento.
 */
type Chave = 'dono' | 'membro' | 'externo' | 'estranho' | 'cliente'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  dono: { perfil: 'profissional', prestador: 'profissional' },
  membro: { perfil: 'profissional', prestador: 'profissional' },
  externo: { perfil: 'profissional', prestador: 'profissional' },
  estranho: { perfil: 'profissional', prestador: 'profissional' },
  cliente: { perfil: 'cliente' },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>
let empresaId: string

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  await limparAtendimentosDosPrestadores(ids)
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(empresaMembros).where(inArray(empresaMembros.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
  await db.delete(empresas).where(like(empresas.nome, `Escritório${SUFIXO}`))
}

async function montar() {
  await limpar()
  const criadas = {} as Record<Chave, Conta>
  let i = 0
  for (const chave of Object.keys(DEFINICOES) as Chave[]) {
    const def = DEFINICOES[chave]
    await db.insert(perfis).values({ nome: def.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, def.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Colaboracao ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193400${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (def.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: def.prestador,
        tipoProfissional: 'contabilidade',
        apresentacao: 'Conta de teste de colaboração.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'colaboracao-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }

  // Escritório real: é dele que sai a noção de "já pertence à equipe".
  const [empresa] = await db
    .insert(empresas)
    .values({
      nome: `Escritório${SUFIXO}`,
      tipo: 'prestadora',
      segmento: 'contabilidade',
      status: 'ativo',
    })
    .returning({ id: empresas.id })
  empresaId = empresa.id

  await db.insert(empresaMembros).values([
    {
      empresaId,
      usuarioId: criadas.dono.id,
      funcao: 'proprietario',
      status: 'ativo',
    },
    {
      empresaId,
      usuarioId: criadas.membro.id,
      funcao: 'colaborador',
      status: 'ativo',
    },
  ])

  return criadas
}

const BASE = {
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

/** Cria serviço do dono e contrata como cliente: devolve o Atendimento real. */
async function criarAtendimento() {
  entrarComo(contas.dono.token)
  const servico = await criarServico(BASE)
  if (!servico.sucesso) throw new Error(servico.mensagem)

  entrarComo(contas.cliente.token)
  const contratacao = await contratarServico({
    servicoId: (servico as { dados: { id: string } }).dados.id,
  })
  if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
  sairDaSessao()

  return (contratacao.dados as { atendimentoId: string }).atendimentoId
}

async function convidarExterno(
  atendimentoId: string,
  valorOferecidoCentavos: number | null = 80000,
) {
  const resultado = await convidarParaAtendimento({
    atendimentoId,
    usuarioId: contas.dono.id,
    destinatarioId: contas.externo.id,
    escopo: 'Elaborar o contrato social e acompanhar a junta.',
    valorOferecidoCentavos,
  })
  if (!resultado.sucesso) throw new Error(resultado.motivo)
  return resultado.id
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('atribuição direta de quem já é da equipe', () => {
  it('membro do escritório vira participante sem convite', async () => {
    const atendimentoId = await criarAtendimento()

    const resultado = await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })
    expect(resultado).toEqual({ sucesso: true, alterado: true })

    const participantes = await db
      .select()
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId))
    const membro = participantes.find((p) => p.usuarioId === contas.membro.id)
    expect(membro?.papel).toBe('convidado')
    // Atribuição direta não passa por convite: a coluna aponta para nada.
    expect(membro?.conviteId).toBeNull()

    // O Atendimento passa a existir para ele — a consulta do quadro já filtra
    // por participação.
    const quadro = await listarAtendimentosDoPrestador(contas.membro.id)
    expect(quadro.map((a) => a.id)).toContain(atendimentoId)
  })

  it('registra o fato no histórico e não expõe ao cliente', async () => {
    const atendimentoId = await criarAtendimento()
    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })

    const [evento] = await db
      .select()
      .from(atendimentoEventos)
      .where(eq(atendimentoEventos.tipo, 'participante_atribuido'))
    expect(evento.atendimentoId).toBe(atendimentoId)
    // Composição interna da equipe é assunto da casa.
    expect(evento.visivelCliente).toBe(false)
  })

  it('atribuir duas vezes não duplica participação', async () => {
    const atendimentoId = await criarAtendimento()
    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })
    const repetido = await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })
    expect(repetido).toEqual({ sucesso: true, alterado: false })

    const participantes = await db
      .select()
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId))
    expect(
      participantes.filter((p) => p.usuarioId === contas.membro.id),
    ).toHaveLength(1)
  })

  it('quem não é da equipe é recusado, mesmo com o id na mão', async () => {
    const atendimentoId = await criarAtendimento()
    const resultado = await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.externo.id,
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'fora-da-equipe' })
  })

  it('participante convidado não gerencia a composição do atendimento', async () => {
    const atendimentoId = await criarAtendimento()
    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })

    // O membro participa, mas não é dono nem responsável.
    const resultado = await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.membro.id,
      membroId: contas.estranho.id,
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })

  it('a lista de atribuíveis marca quem já participa e ignora estranhos', async () => {
    const atendimentoId = await criarAtendimento()
    const antes = await listarMembrosAtribuiveis(atendimentoId, contas.dono.id)
    const nomes = antes.map((m) => m.usuarioId)
    expect(nomes).toContain(contas.membro.id)
    expect(nomes).not.toContain(contas.externo.id)
    expect(antes.find((m) => m.usuarioId === contas.dono.id)?.jaParticipa).toBe(true)

    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })
    const depois = await listarMembrosAtribuiveis(atendimentoId, contas.dono.id)
    expect(depois.find((m) => m.usuarioId === contas.membro.id)?.jaParticipa).toBe(
      true,
    )
  })

  it('quem não alcança o atendimento não lista a equipe dele', async () => {
    const atendimentoId = await criarAtendimento()
    expect(
      await listarMembrosAtribuiveis(atendimentoId, contas.estranho.id),
    ).toEqual([])
  })
})

describe('remoção de participante', () => {
  it('remove o convidado e devolve o atendimento ao invisível para ele', async () => {
    const atendimentoId = await criarAtendimento()
    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })

    const resultado = await removerParticipante({
      atendimentoId,
      usuarioId: contas.dono.id,
      participanteId: contas.membro.id,
    })
    expect(resultado).toEqual({ sucesso: true, alterado: true })

    const quadro = await listarAtendimentosDoPrestador(contas.membro.id)
    expect(quadro.map((a) => a.id)).not.toContain(atendimentoId)
  })

  it('o responsável não sai por aqui', async () => {
    const atendimentoId = await criarAtendimento()
    const resultado = await removerParticipante({
      atendimentoId,
      usuarioId: contas.dono.id,
      participanteId: contas.dono.id,
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'responsavel' })
  })
})

describe('convite de colaboração externa', () => {
  it('convidar não dá acesso: o atendimento só aparece depois do aceite', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarExterno(atendimentoId)

    const quadro = await listarAtendimentosDoPrestador(contas.externo.id)
    expect(quadro.map((a) => a.id)).not.toContain(atendimentoId)

    const participantes = await db
      .select()
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId))
    expect(participantes.map((p) => p.usuarioId)).not.toContain(contas.externo.id)
  })

  it('o escopo abre a negociação como primeira linha, com o valor oferecido', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)

    const [linha] = await db
      .select()
      .from(atendimentoConviteMensagens)
      .where(eq(atendimentoConviteMensagens.conviteId, conviteId))
    expect(linha.tipo).toBe('proposta')
    expect(linha.valorCentavos).toBe(80000)
    expect(linha.autorId).toBe(contas.dono.id)
  })

  it('convite sem valor abre a negociação como mensagem, não como proposta', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, null)

    const [linha] = await db
      .select()
      .from(atendimentoConviteMensagens)
      .where(eq(atendimentoConviteMensagens.conviteId, conviteId))
    expect(linha.tipo).toBe('mensagem')
    expect(linha.valorCentavos).toBeNull()
  })

  it('não convida a si mesmo nem o cliente do atendimento', async () => {
    const atendimentoId = await criarAtendimento()

    expect(
      await convidarParaAtendimento({
        atendimentoId,
        usuarioId: contas.dono.id,
        destinatarioId: contas.dono.id,
        escopo: 'qualquer',
        valorOferecidoCentavos: null,
      }),
    ).toEqual({ sucesso: false, motivo: 'destinatario-invalido' })

    expect(
      await convidarParaAtendimento({
        atendimentoId,
        usuarioId: contas.dono.id,
        destinatarioId: contas.cliente.id,
        escopo: 'qualquer',
        valorOferecidoCentavos: null,
      }),
    ).toEqual({ sucesso: false, motivo: 'destinatario-invalido' })
  })

  it('não existem dois convites vivos para a mesma pessoa', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarExterno(atendimentoId)

    const repetido = await convidarParaAtendimento({
      atendimentoId,
      usuarioId: contas.dono.id,
      destinatarioId: contas.externo.id,
      escopo: 'outro escopo',
      valorOferecidoCentavos: 50000,
    })
    expect(repetido).toEqual({ sucesso: false, motivo: 'ja-convidado' })
  })

  it('quem não gerencia o atendimento não convida ninguém', async () => {
    const atendimentoId = await criarAtendimento()
    const resultado = await convidarParaAtendimento({
      atendimentoId,
      usuarioId: contas.estranho.id,
      destinatarioId: contas.externo.id,
      escopo: 'tentativa',
      valorOferecidoCentavos: null,
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })
})

describe('contexto limitado analisado antes do aceite', () => {
  it('entrega medida do trabalho sem revelar a identidade do cliente', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    const contexto = await obterContextoDoConvite(conviteId, contas.externo.id)
    expect(contexto).not.toBeNull()
    expect(contexto?.titulo).toBe('Abertura de Empresa')
    expect(contexto?.status).toBe('novo')
    expect(contexto?.totalEtapasChecklist).toBe(1)
    expect(contexto?.totalParticipantes).toBe(1)
    // O nome do Cliente não atravessa: só as iniciais.
    expect(contexto?.clienteIniciais).toBe('C. C.')
    expect(JSON.stringify(contexto)).not.toContain('Colaboracao cliente')
  })

  it('só o destinatário do convite lê o contexto', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    expect(await obterContextoDoConvite(conviteId, contas.estranho.id)).toBeNull()
    // Nem o remetente entra por esta porta: ele lê o Atendimento inteiro pela
    // consulta normal.
    expect(await obterContextoDoConvite(conviteId, contas.dono.id)).toBeNull()
  })
})

describe('negociação privada do convite', () => {
  it('contraproposta do convidado grava o valor estruturado', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)

    const resultado = await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.externo.id,
      conteudo: 'Consigo fazer por este valor.',
      valorCentavos: 95000,
    })
    expect(resultado.sucesso).toBe(true)

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.valorContrapropostaCentavos).toBe(95000)
    // A oferta de quem convidou não muda sozinha por causa da contraproposta.
    expect(convite.valorOferecidoCentavos).toBe(80000)
  })

  it('nova proposta do remetente atualiza a oferta vigente', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.externo.id,
      conteudo: 'Faço por 950.',
      valorCentavos: 95000,
    })
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.dono.id,
      conteudo: 'Fechado por 950.',
      valorCentavos: 95000,
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.valorOferecidoCentavos).toBe(95000)
  })

  it('mensagem sem valor não mexe em nenhuma proposta', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.externo.id,
      conteudo: 'Qual o prazo real?',
      valorCentavos: null,
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.valorOferecidoCentavos).toBe(80000)
    expect(convite.valorContrapropostaCentavos).toBeNull()
  })

  it('terceiro não escreve nem lê a negociação', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    expect(
      await escreverNaNegociacao({
        conviteId,
        usuarioId: contas.estranho.id,
        conteudo: 'intruso',
        valorCentavos: null,
      }),
    ).toEqual({ sucesso: false, motivo: 'sem-acesso' })

    expect(await listarConvitesDaPessoa(contas.estranho.id)).toEqual([])
  })

  it('a negociação não aparece para um participante que não é parte do convite', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarExterno(atendimentoId)
    // O membro é participante, mas o convite não é dele.
    await atribuirMembroDaEquipe({
      atendimentoId,
      usuarioId: contas.dono.id,
      membroId: contas.membro.id,
    })

    // Participante comum sequer lista os convites do Atendimento.
    expect(
      await listarConvitesDoAtendimento(atendimentoId, contas.membro.id),
    ).toEqual([])

    // E quem lista, lista só a própria negociação.
    const doDono = await listarConvitesDoAtendimento(atendimentoId, contas.dono.id)
    expect(doDono).toHaveLength(1)
    expect(doDono[0].negociacao.length).toBeGreaterThan(0)
  })
})

describe('aceite e recusa', () => {
  it('aceitar congela a oferta vigente e transforma o convidado em participante', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)

    const resultado = await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })
    expect(resultado.sucesso).toBe(true)
    expect(
      resultado.sucesso ? resultado.valorAcordadoCentavos : null,
    ).toBe(80000)

    const [participante] = await db
      .select()
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.usuarioId, contas.externo.id))
    expect(participante.atendimentoId).toBe(atendimentoId)
    expect(participante.papel).toBe('convidado')
    // A entrada guarda por onde a pessoa veio.
    expect(participante.conviteId).toBe(conviteId)

    const quadro = await listarAtendimentosDoPrestador(contas.externo.id)
    expect(quadro.map((a) => a.id)).toContain(atendimentoId)
  })

  it('contraproposta não vira acordo sozinha', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId, 80000)
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.externo.id,
      conteudo: 'Faço por 950.',
      valorCentavos: 95000,
    })

    await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    // Aceitou o que estava oferecido, não o que ele mesmo pediu.
    expect(convite.valorAcordadoCentavos).toBe(80000)
  })

  it('recusar não dá acesso e encerra o convite', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    const resultado = await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'recusar',
    })
    expect(resultado.sucesso).toBe(true)

    const quadro = await listarAtendimentosDoPrestador(contas.externo.id)
    expect(quadro.map((a) => a.id)).not.toContain(atendimentoId)

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.status).toBe('recusado')
    expect(convite.valorAcordadoCentavos).toBeNull()
  })

  it('só o convidado responde — nem quem convidou aceita por ele', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    expect(
      await responderConvite({
        conviteId,
        usuarioId: contas.dono.id,
        resposta: 'aceitar',
      }),
    ).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })

  it('convite respondido não recebe segunda resposta nem nova linha', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })

    expect(
      await responderConvite({
        conviteId,
        usuarioId: contas.externo.id,
        resposta: 'recusar',
      }),
    ).toEqual({ sucesso: false, motivo: 'encerrado' })

    expect(
      await escreverNaNegociacao({
        conviteId,
        usuarioId: contas.externo.id,
        conteudo: 'mais uma coisa',
        valorCentavos: null,
      }),
    ).toEqual({ sucesso: false, motivo: 'encerrado' })
  })

  it('o aceite entra no histórico sem chegar ao cliente', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })

    const eventos = await db
      .select()
      .from(atendimentoEventos)
      .where(eq(atendimentoEventos.atendimentoId, atendimentoId))
    const colaboracao = eventos.filter((e) =>
      ['convite_enviado', 'convite_aceito'].includes(e.tipo),
    )
    expect(colaboracao).toHaveLength(2)
    // Valor e escopo combinados entre prestadores nunca são assunto do Cliente.
    expect(colaboracao.every((e) => e.visivelCliente === false)).toBe(true)
  })
})

describe('cancelamento do convite', () => {
  it('cancela o pendente e libera um convite novo para a mesma pessoa', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    expect(
      await revogarConvite({ conviteId, usuarioId: contas.dono.id }),
    ).toEqual({ sucesso: true })

    // Com o anterior fora dos estados vivos, o índice de unicidade libera.
    const novo = await convidarParaAtendimento({
      atendimentoId,
      usuarioId: contas.dono.id,
      destinatarioId: contas.externo.id,
      escopo: 'Escopo revisado.',
      valorOferecidoCentavos: 90000,
    })
    expect(novo.sucesso).toBe(true)
  })

  it('convite já aceito não é cancelado por aqui', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })

    expect(
      await revogarConvite({ conviteId, usuarioId: contas.dono.id }),
    ).toEqual({ sucesso: false, motivo: 'encerrado' })
  })

  it('quem não gerencia o atendimento não cancela convite dele', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    expect(
      await revogarConvite({ conviteId, usuarioId: contas.estranho.id }),
    ).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })
})

describe('caixa de convites do convidado', () => {
  it('lista o convite pendente com a negociação dele', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarExterno(atendimentoId, 80000)

    const recebidos = await listarConvitesDaPessoa(contas.externo.id)
    expect(recebidos).toHaveLength(1)
    expect(recebidos[0].papel).toBe('destinatario')
    expect(recebidos[0].status).toBe('pendente')
    expect(recebidos[0].valorOferecidoCentavos).toBe(80000)
    expect(recebidos[0].negociacao[0].autoria).toBe(false)
  })
})

describe('leitura de valores digitados', () => {
  it('entende as formas que aparecem num campo livre', () => {
    expect(centavosDoTexto('1.234,56')).toBe(123456)
    expect(centavosDoTexto('1234,56')).toBe(123456)
    expect(centavosDoTexto('1234.56')).toBe(123456)
    expect(centavosDoTexto('800')).toBe(80000)
    // Campo vazio é ausência de valor, e não zero.
    expect(centavosDoTexto('   ')).toBeNull()
  })

  it('formata em real e não inventa zero para ausência', () => {
    // `toLocaleString('pt-BR')` separa "R$" do número com espaço não separável
    // (U+00A0). Escrito com escape para ficar visível no código — e para o lint
    // não tropeçar num caractere invisível.
    expect(rotuloValorCentavos(123456).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56')
    expect(rotuloValorCentavos(null)).toBe('Sem valor definido')
    expect(rotuloValorCentavos(null, '—')).toBe('—')
  })
})


/**
 * O destaque verde do Dashboard, quando o assunto é convite.
 *
 * O que se testa aqui é o dado que decide o destaque, e não o desenho: quantos
 * convites chegaram sem nunca terem sido abertos, e o que acontece com esse
 * número depois que a pessoa abre um. "Visualizado" é a marca de leitura que a
 * plataforma já gravava ao abrir a negociação — nenhum estado novo, e nada de
 * estado só no React, senão um F5 traria o destaque de volta.
 */
describe('destaque de convites novos no Dashboard', () => {
  it('sem convite recebido, não há o que destacar', async () => {
    const resumo = await obterResumoDoPainel(contas.externo.id)
    expect(resumo.convitesNovos).toBe(0)
    expect(resumo.primeiroConviteNovoId).toBeNull()
  })

  it('convite recém-recebido conta como novo — e só para quem o recebeu', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    const doConvidado = await obterResumoDoPainel(contas.externo.id)
    expect(doConvidado.convitesNovos).toBe(1)
    expect(doConvidado.primeiroConviteNovoId).toBe(conviteId)

    // Quem convidou não tem o que analisar: o destaque é de quem recebeu.
    const doRemetente = await obterResumoDoPainel(contas.dono.id)
    expect(doRemetente.convitesNovos).toBe(0)

    // E quem não é nenhuma das duas pontas não fica sabendo que ele existe.
    const doEstranho = await obterResumoDoPainel(contas.estranho.id)
    expect(doEstranho.convitesNovos).toBe(0)
  })

  it('três convites novos contam três; visualizar um deixa dois', async () => {
    const primeiro = await convidarExterno(await criarAtendimento())
    await convidarExterno(await criarAtendimento())
    await convidarExterno(await criarAtendimento())

    expect((await obterResumoDoPainel(contas.externo.id)).convitesNovos).toBe(3)

    // Abrir a negociação é o gesto de visualizar — o mesmo que a caixa de
    // convites já fazia antes deste destaque existir.
    const leitura = await marcarNegociacaoComoLida({
      conviteId: primeiro,
      usuarioId: contas.externo.id,
    })
    expect(leitura).toEqual({ sucesso: true })

    const depois = await obterResumoDoPainel(contas.externo.id)
    expect(depois.convitesNovos).toBe(2)
    expect(depois.primeiroConviteNovoId).not.toBe(primeiro)

    // Consulta nova, do zero: é o F5. O convite visualizado não volta a ser
    // novo porque a marca está no banco, e não na memória da tela.
    const recarregado = await listarConvitesDaPessoa(contas.externo.id)
    expect(contarConvitesNovos(recarregado)).toBe(2)
    expect(recarregado.find((c) => c.id === primeiro)?.novoParaDestaque).toBe(false)
    expect(primeiroConviteNovo(recarregado)).not.toBe(primeiro)
  })

  it('visualizar não muda o estado comercial do convite', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    await marcarNegociacaoComoLida({
      conviteId,
      usuarioId: contas.externo.id,
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.status).toBe('pendente')
    expect(convite.respondidoEm).toBeNull()

    // E o fluxo de resposta continua inteiro depois de visualizado.
    const aceite = await responderConvite({
      conviteId,
      usuarioId: contas.externo.id,
      resposta: 'aceitar',
    })
    expect(aceite.sucesso).toBe(true)
  })

  it('o aviso continua no sino depois de o convite deixar de ser novo', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarExterno(atendimentoId)

    const antes = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.recursoId, conviteId))
    expect(antes).toHaveLength(1)
    expect(antes[0].destinatarioId).toBe(contas.externo.id)

    await marcarNegociacaoComoLida({
      conviteId,
      usuarioId: contas.externo.id,
    })

    // A linha do sino continua lá — o destaque é temporário, o sino é
    // histórico. O que muda é a marca de lida, que é a semântica que o sino
    // sempre teve.
    const depois = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.recursoId, conviteId))
    expect(depois).toHaveLength(1)
    expect(depois[0].lidaEm).not.toBeNull()
  })
})
