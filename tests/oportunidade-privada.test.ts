import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentoParticipantes,
  atendimentos,
  clientes,
  eventosAuditoria,
  notificacoes,
  oportunidadeArquivos,
  oportunidadeContrapropostas,
  oportunidadeDispensas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  aceitarProposta,
  criarContraproposta,
  responderContraproposta,
} from '@/features/oportunidades/actions/negociacao'
import { criarOportunidade } from '@/features/oportunidades/actions/oportunidades'
import {
  enviarProposta,
  marcarSemInteresse,
} from '@/features/oportunidades/actions/propostas'
import { obterVinculoComOportunidade } from '@/features/oportunidades/lib/autorizacao'
import { obterArquivoDaOportunidade } from '@/features/oportunidades/queries/obter-arquivo-da-oportunidade'
import { obterDestinatarioPrivado } from '@/features/oportunidades/queries/obter-destinatario-privado'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
import {
  contarDisponiveisPorOrigem,
  listarOportunidadesDoPrestador,
} from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import { pagarAcordoSimulado } from '@/features/pagamentos/actions/pagamento-simulado'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * Solicitação de orçamento **dirigida a um Profissional**.
 *
 * A pergunta que este arquivo responde é uma só, em várias formas: *quem
 * alcança um pedido que o Cliente enviou para uma pessoa específica?* A
 * resposta precisa ser "o Cliente dono e o destinatário", e precisa valer por
 * chamada direta — não por a tela esconder o botão.
 *
 * O resto do caminho (proposta, contraproposta, acordo, pagamento, Atendimento)
 * é o motor público, e está aqui só para provar que ele **é** o mesmo: nenhuma
 * dessas etapas ganhou uma versão privada.
 */

const SUFIXO = '@oportunidade-privada.teste'

type Chave =
  | 'cliente'
  | 'outroCliente'
  | 'clienteSemConfirmar'
  | 'contador'
  | 'contadorRival'
  | 'advogado'

const DEFINICOES: Record<
  Chave,
  {
    perfil: string
    confirmada?: boolean
    prestador?: 'profissional'
    tipoProfissional?: string
    statusAnalise?: string
  }
> = {
  cliente: { perfil: 'cliente' },
  outroCliente: { perfil: 'cliente' },
  clienteSemConfirmar: { perfil: 'cliente', confirmada: false },
  contador: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
  // Igualmente habilitado e igualmente compatível: é ele quem prova que
  // compatibilidade **não basta** numa solicitação dirigida a outra pessoa.
  contadorRival: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
  advogado: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'advocacia',
    statusAnalise: 'aprovado',
  },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const CONTABIL = {
  categoria: 'contabilidade',
  descricao:
    'Preciso regularizar a contabilidade da empresa e as obrigações fiscais do ano.',
  abrangencia: 'BR',
}

const PROPOSTA = {
  mensagem: 'Assumo a regularização e as obrigações do período, com relatórios mensais.',
  valor: '900,00',
  prazoEstimadoDias: 15,
}

function formulario(dados: Record<string, string>, especialidades: string[] = []) {
  const dado = new FormData()
  for (const [chave, valor] of Object.entries(dados)) dado.set(chave, valor)
  for (const item of especialidades) dado.append('especialidades', item)
  return dado
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  const protocolos = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(inArray(atendimentos.clienteUsuarioId, ids))
  const protocoloIds = protocolos.map(({ id }) => id)
  if (protocoloIds.length) {
    for (const tabela of [
      atendimentoArquivos,
      atendimentoChecklistItens,
      atendimentoEventos,
      atendimentoManifestacoes,
      atendimentoMensagens,
      atendimentoParticipantes,
    ]) {
      await db.delete(tabela).where(inArray(tabela.atendimentoId, protocoloIds))
    }
    await db.delete(atendimentos).where(inArray(atendimentos.id, protocoloIds))
  }

  const solicitacoes = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, ids))
  const solicitacaoIds = solicitacoes.map(({ id }) => id)
  if (solicitacaoIds.length) {
    const propostas = await db
      .select({ id: oportunidadePropostas.id })
      .from(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
    if (propostas.length) {
      await db.delete(oportunidadeContrapropostas).where(
        inArray(
          oportunidadeContrapropostas.propostaId,
          propostas.map(({ id }) => id),
        ),
      )
    }
    await db
      .delete(oportunidadePagamentos)
      .where(inArray(oportunidadePagamentos.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadeArquivos)
      .where(inArray(oportunidadeArquivos.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadeDispensas)
      .where(inArray(oportunidadeDispensas.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
    await db.delete(oportunidades).where(inArray(oportunidades.id, solicitacaoIds))
  }

  await db.delete(clientes).where(inArray(clientes.usuarioId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

async function montar() {
  await limpar()
  const criadas = {} as Record<Chave, Conta>
  let i = 0
  for (const chave of Object.keys(DEFINICOES) as Chave[]) {
    const def = DEFINICOES[chave]
    const confirmada = def.confirmada ?? true
    await db.insert(perfis).values({ nome: def.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, def.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Privada ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1194300${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: confirmada,
        emailVerificadoEm: confirmada ? new Date() : null,
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (def.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: def.prestador,
        tipoProfissional: def.tipoProfissional!,
        apresentacao: 'Conta de teste da solicitação privada.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        areasAtuacao: [],
        especialidades: ['Planejamento Tributário'],
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: def.statusAnalise!,
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'oportunidade-privada-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

/** Cria uma solicitação dirigida ao contador e devolve o id. */
async function solicitarPrivada(
  extra: Record<string, string> = {},
  dono: Chave = 'cliente',
  destino: Chave = 'contador',
) {
  entrarComo(contas[dono].token)
  const resultado = await criarOportunidade(
    formulario({
      ...CONTABIL,
      destinatarioId: contas[destino].id,
      ...extra,
    }),
  )
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { oportunidadeId: string } }).dados.oportunidadeId
}

async function propor(chave: Chave, oportunidadeId: string, extra = {}) {
  entrarComo(contas[chave].token)
  const resultado = await enviarProposta({
    oportunidadeId,
    ...PROPOSTA,
    ...extra,
  })
  return resultado
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('quem pode criar uma solicitação direta', () => {
  it('cliente confirmado cria e a solicitação nasce privada e dirigida', async () => {
    const id = await solicitarPrivada()

    const [linha] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.visibilidade).toBe('privada')
    expect(linha.destinatarioId).toBe(contas.contador.id)
    // O prazo global é o mesmo das públicas: não existe validade própria.
    expect(linha.expiraEm).not.toBeNull()
  })

  it('visitante sem sessão não cria', async () => {
    sairDaSessao()
    const resultado = await criarOportunidade(
      formulario({ ...CONTABIL, destinatarioId: contas.contador.id }),
    )
    expect(resultado.sucesso).toBe(false)

    const total = await db.select().from(oportunidades)
    expect(total).toHaveLength(0)
  })

  it('cliente sem confirmar a conta não cria', async () => {
    entrarComo(contas.clienteSemConfirmar.token)
    const resultado = await criarOportunidade(
      formulario({ ...CONTABIL, destinatarioId: contas.contador.id }),
    )
    expect(resultado.sucesso).toBe(false)

    const total = await db.select().from(oportunidades)
    expect(total).toHaveLength(0)
  })

  it('categoria incompatível com o destinatário é recusada no servidor', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await criarOportunidade(
      formulario({
        categoria: 'advocacia',
        descricao:
          'Preciso de orientação jurídica para revisar contratos de prestação de serviço.',
        abrangencia: 'BR',
        // Payload alterado à mão: a tela nunca ofereceria Jurídico para um
        // contador, mas a recusa não pode depender disso.
        destinatarioId: contas.contador.id,
      }),
    )
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('não atende a categoria')
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('especialidade de outra categoria é recusada', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await criarOportunidade(
      formulario(
        { ...CONTABIL, destinatarioId: contas.contador.id },
        ['Direito Trabalhista'],
      ),
    )
    expect(resultado.sucesso).toBe(false)
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('destinatário inexistente no payload não cria solicitação órfã', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await criarOportunidade(
      formulario({ ...CONTABIL, destinatarioId: randomUUID() }),
    )
    expect(resultado.sucesso).toBe(false)
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('sem destinatário, a solicitação continua nascendo pública', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await criarOportunidade(formulario(CONTABIL))
    expect(resultado.sucesso).toBe(true)

    const [linha] = await db.select().from(oportunidades)
    expect(linha.visibilidade).toBe('publica')
    expect(linha.destinatarioId).toBeNull()
  })
})

describe('quem alcança uma solicitação direta', () => {
  it('o destinatário alcança; outro profissional compatível não', async () => {
    const id = await solicitarPrivada()

    expect(
      await obterVinculoComOportunidade(id, contas.cliente.id),
    ).toBe('cliente')
    expect(
      await obterVinculoComOportunidade(id, contas.contador.id),
    ).toBe('prestador')
    // Mesma categoria, mesma habilitação, e ainda assim nada: o pedido tem dono.
    expect(
      await obterVinculoComOportunidade(id, contas.contadorRival.id),
    ).toBeNull()
    expect(
      await obterVinculoComOportunidade(id, contas.outroCliente.id),
    ).toBeNull()
  })

  it('não entra na listagem de outro profissional', async () => {
    const id = await solicitarPrivada()

    const doDestinatario = await listarOportunidadesDoPrestador(contas.contador.id)
    expect(doDestinatario.map((item) => item.id)).toContain(id)
    expect(doDestinatario[0].visibilidade).toBe('privada')
    expect(doDestinatario[0].direcionadaAMim).toBe(true)

    const doRival = await listarOportunidadesDoPrestador(contas.contadorRival.id)
    expect(doRival.map((item) => item.id)).not.toContain(id)
  })

  it('não entra no número do destaque de outro profissional', async () => {
    await solicitarPrivada()

    expect(await contarDisponiveisPorOrigem(contas.contador.id)).toEqual({
      total: 1,
      diretas: 1,
    })
    expect(await contarDisponiveisPorOrigem(contas.contadorRival.id)).toEqual({
      total: 0,
      diretas: 0,
    })
  })

  it('o anexo não é alcançável por outro profissional', async () => {
    const id = await solicitarPrivada()
    const [arquivo] = await db
      .insert(oportunidadeArquivos)
      .values({
        oportunidadeId: id,
        nome: 'balancete.pdf',
        tipoMime: 'application/pdf',
        tamanhoBytes: 1024,
        remetenteId: contas.cliente.id,
        chave: `oportunidades/${id}/arquivos/${randomUUID()}.pdf`,
      })
      .returning({ id: oportunidadeArquivos.id })

    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: id,
        arquivoId: arquivo.id,
        usuarioId: contas.contador.id,
      }),
    ).not.toBeNull()
    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: id,
        arquivoId: arquivo.id,
        usuarioId: contas.contadorRival.id,
      }),
    ).toBeNull()
  })

  it('outro profissional não envia proposta, mesmo com o id na mão', async () => {
    const id = await solicitarPrivada()

    const rival = await propor('contadorRival', id)
    expect(rival.sucesso).toBe(false)

    const advogado = await propor('advogado', id)
    expect(advogado.sucesso).toBe(false)

    expect(await db.select().from(oportunidadePropostas)).toHaveLength(0)
  })

  it('outro profissional não consegue nem dispensar a solicitação', async () => {
    const id = await solicitarPrivada()

    entrarComo(contas.contadorRival.token)
    const resultado = await marcarSemInteresse({ oportunidadeId: id })
    expect(resultado.sucesso).toBe(false)
    expect(await db.select().from(oportunidadeDispensas)).toHaveLength(0)
  })
})

describe('notificações da solicitação direta', () => {
  it('somente o destinatário é avisado, e com o texto do pedido direto', async () => {
    const id = await solicitarPrivada()

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.recursoId, id))
    expect(avisos).toHaveLength(1)
    expect(avisos[0].destinatarioId).toBe(contas.contador.id)
    expect(avisos[0].tipo).toBe(TIPOS_NOTIFICACAO.oportunidadeDireta)
    expect(avisos[0].titulo).toContain('diretamente a você')
    // O aviso não carrega dado de contato do Cliente.
    expect(avisos[0].resumo).not.toContain(SUFIXO)
  })

  it('a pública continua avisando todos os compatíveis, como antes', async () => {
    entrarComo(contas.cliente.token)
    const resultado = await criarOportunidade(formulario(CONTABIL))
    expect(resultado.sucesso).toBe(true)

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.tipo, TIPOS_NOTIFICACAO.oportunidadeDisponivel))
    expect(avisos.map((aviso) => aviso.destinatarioId).sort()).toEqual(
      [contas.contador.id, contas.contadorRival.id].sort(),
    )
  })
})

describe('a Área do Cliente conta a história da solicitação direta', () => {
  it('mostra o destinatário e o rótulo de solicitação direta', async () => {
    const id = await solicitarPrivada()

    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.id).toBe(id)
    expect(vista.visibilidade).toBe('privada')
    expect(vista.destinatario?.id).toBe(contas.contador.id)
    expect(vista.destinatario?.perfilUrl).toContain(contas.contador.id)
    expect(vista.semInteresseEm).toBeNull()
  })

  it('a pública continua sem destinatário e sem data de recusa', async () => {
    entrarComo(contas.cliente.token)
    await criarOportunidade(formulario(CONTABIL))

    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.visibilidade).toBe('publica')
    expect(vista.destinatario).toBeNull()
    expect(vista.semInteresseEm).toBeNull()
  })
})

describe('caminho 3 — o profissional não tem interesse', () => {
  it('o Cliente passa a saber que nenhuma proposta virá', async () => {
    const id = await solicitarPrivada()

    entrarComo(contas.contador.token)
    const resultado = await marcarSemInteresse({ oportunidadeId: id })
    expect(resultado.sucesso).toBe(true)

    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.semInteresseEm).not.toBeNull()
    expect(vista.totalPropostas).toBe(0)

    // O Cliente é avisado — no privado, e só nele.
    const aviso = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.cliente.id))
    expect(aviso).toHaveLength(1)
    expect(aviso[0].tipo).toBe(TIPOS_NOTIFICACAO.oportunidadeSemInteresse)
  })

  it('encerra a solicitação com o motivo certo, sem apagar nada', async () => {
    const id = await solicitarPrivada()
    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })

    const [linha] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    // `encerrada` porque parou de receber propostas; o motivo é o que impede o
    // Cliente de ler isso como acordo fechado. Nem `cancelada` (ato dele) nem
    // `expirada` (o relógio) descreveriam o que aconteceu.
    expect(linha.status).toBe('encerrada')
    expect(linha.motivoEncerramento).toBe('sem_interesse')
    expect(linha.encerradaEm).not.toBeNull()

    // Nada apagado: a solicitação e a dispensa continuam no histórico.
    const dispensas = await db
      .select()
      .from(oportunidadeDispensas)
      .where(eq(oportunidadeDispensas.oportunidadeId, id))
    expect(dispensas).toHaveLength(1)
  })

  it('o destinatário não consegue mais enviar proposta depois de recusar', async () => {
    const id = await solicitarPrivada()
    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })

    const tardia = await propor('contador', id)
    expect(tardia.sucesso).toBe(false)
    expect(await db.select().from(oportunidadePropostas)).toHaveLength(0)

    // E ela sai da lista e do número do destaque dele.
    const dele = await listarOportunidadesDoPrestador(contas.contador.id)
    expect(dele.map((item) => item.id)).not.toContain(id)
    expect(await contarDisponiveisPorOrigem(contas.contador.id)).toEqual({
      total: 0,
      diretas: 0,
    })
  })

  it('recusar duas vezes não duplica aviso nem reescreve o encerramento', async () => {
    const id = await solicitarPrivada()
    entrarComo(contas.contador.token)
    const primeira = await marcarSemInteresse({ oportunidadeId: id })
    expect(primeira.sucesso).toBe(true)

    const [antes] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))

    // A segunda tentativa é recusada: não se dispensa o que já não está aberto.
    const segunda = await marcarSemInteresse({ oportunidadeId: id })
    expect(segunda.sucesso).toBe(false)

    const [depois] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(depois.encerradaEm?.toISOString()).toBe(
      antes.encerradaEm?.toISOString(),
    )

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.cliente.id))
    expect(avisos).toHaveLength(1)
  })

  it('o Cliente lê a etapa como sem interesse, e não como encerrada', async () => {
    const id = await solicitarPrivada()
    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })

    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.etapa).toBe('sem_interesse')
    // Sem acordo e sem solicitação ativa: nada a aceitar, contrapor ou pagar.
    expect(vista.ativa).toBe(false)
    expect(vista.pagamento).toBeNull()
  })

  it('na pública o Cliente continua vendo só o número agregado', async () => {
    entrarComo(contas.cliente.token)
    const publica = await criarOportunidade(formulario(CONTABIL))
    const id = (publica as { dados: { oportunidadeId: string } }).dados
      .oportunidadeId

    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })

    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.totalSemInteresse).toBe(1)
    // Sem destinatário não há a quem atribuir a decisão: o campo continua nulo.
    expect(vista.semInteresseEm).toBeNull()
    const avisosDoCliente = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.cliente.id))
    expect(avisosDoCliente).toHaveLength(0)
  })
})

describe('caminho 1 — proposta aceita, pagamento e Atendimento', () => {
  it('reutiliza o motor público de ponta a ponta', async () => {
    const id = await solicitarPrivada()

    const proposta = await propor('contador', id)
    expect(proposta.sucesso).toBe(true)

    entrarComo(contas.cliente.token)
    const [antes] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(antes.propostas).toHaveLength(1)
    expect(antes.propostas[0].prestadorId).toBe(contas.contador.id)

    const aceite = await aceitarProposta({
      propostaId: antes.propostas[0].id,
    })
    expect(aceite.sucesso).toBe(true)

    const pagamento = await pagarAcordoSimulado({ oportunidadeId: id })
    expect(pagamento.sucesso).toBe(true)

    const [depois] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(depois.etapa).toBe('em_atendimento')
    expect(depois.pagamento?.origem).toBe('simulado')
    expect(depois.atendimento?.protocolo).toMatch(/^#\d{4}-\d{4}$/)

    // O Atendimento nasce com o par certo — e com a solicitação de origem.
    const [protocolo] = await db
      .select()
      .from(atendimentos)
      .where(eq(atendimentos.oportunidadeId, id))
    expect(protocolo.clienteUsuarioId).toBe(contas.cliente.id)
    expect(protocolo.prestadorId).toBe(contas.contador.id)
  })
})

describe('caminho 2 — contraproposta aceita pelo profissional', () => {
  it('chega ao mesmo Atendimento pelo caminho da negociação', async () => {
    const id = await solicitarPrivada()
    await propor('contador', id)

    entrarComo(contas.cliente.token)
    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    const contra = await criarContraproposta({
      propostaId: vista.propostas[0].id,
      valor: '750,00',
      mensagem: 'Consigo fechar neste valor.',
    })
    expect(contra.sucesso).toBe(true)

    const [comContra] = await listarOportunidadesDoCliente(contas.cliente.id)
    const pendente = comContra.propostas[0].contrapropostaPendente
    expect(pendente).not.toBeNull()

    entrarComo(contas.contador.token)
    const resposta = await responderContraproposta({
      contrapropostaId: pendente!.id,
      decisao: 'aceitar',
    })
    expect(resposta.sucesso).toBe(true)

    entrarComo(contas.cliente.token)
    const pagamento = await pagarAcordoSimulado({ oportunidadeId: id })
    expect(pagamento.sucesso).toBe(true)

    const [final] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(final.etapa).toBe('em_atendimento')
    expect(final.propostas[0].valorAcordadoCentavos).toBe(75000)
  })
})

describe('o destinatário oferecido ao formulário', () => {
  it('traz só as categorias que aquele cadastro alcança', async () => {
    const contador = await obterDestinatarioPrivado(contas.contador.id)
    expect(contador?.categorias).toEqual(['contabilidade'])

    const advogado = await obterDestinatarioPrivado(contas.advogado.id)
    expect(advogado?.categorias).toEqual(['advocacia'])
  })

  it('quem não é prestador habilitado não recebe solicitação direta', async () => {
    expect(await obterDestinatarioPrivado(contas.cliente.id)).toBeNull()
    expect(await obterDestinatarioPrivado(randomUUID())).toBeNull()
  })
})
