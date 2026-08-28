import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
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
import { autorizarCron } from '@/features/agendador/lib/autorizacao-cron'
import { processarPrazos } from '@/features/agendador/lib/processar-prazos'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { processarAvisosDePrazo } from '@/features/notificacoes/lib/avisos-de-prazo'
import {
  aceitarProposta,
  criarContraproposta,
} from '@/features/oportunidades/actions/negociacao'
import { criarOportunidade } from '@/features/oportunidades/actions/oportunidades'
import { enviarProposta } from '@/features/oportunidades/actions/propostas'
import { processarOportunidadesVencidas } from '@/features/oportunidades/lib/processar-vencidas'
import { contarDisponiveisPorOrigem } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
import { pagarAcordoSimulado } from '@/features/pagamentos/actions/pagamento-simulado'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O agendador: quem faz o tempo virar estado.
 *
 * Antes desta etapa, vencimento e aviso de prazo aconteciam **de passagem** —
 * uma leitura consertava o status, a renderização de `/admin` criava
 * notificação. Isso fazia a plataforma depender de alguém abrir uma tela para
 * que o relógio tivesse efeito, e transformava uma renderização em escrita.
 *
 * Este arquivo prova as três coisas que a troca precisa garantir: que o
 * agendador realmente materializa, que ele **não** substitui as validações
 * transacionais (elas continuam recusando o vencido entre duas execuções), e
 * que rodar duas vezes — ou duas vezes ao mesmo tempo — não duplica nada.
 */

const SUFIXO = '@agendador.teste'

type Chave = 'cliente' | 'contador' | 'contadorB'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  cliente: { perfil: 'cliente' },
  contador: { perfil: 'profissional', prestador: 'profissional' },
  contadorB: { perfil: 'profissional', prestador: 'profissional' },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SOLICITACAO = {
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

function formulario(dados: Record<string, string> = {}) {
  const dado = new FormData()
  for (const [chave, valor] of Object.entries({ ...SOLICITACAO, ...dados })) {
    dado.set(chave, valor)
  }
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
    await db.insert(perfis).values({ nome: def.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, def.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Agendador ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1194400${String(i).padStart(4, '0')}`,
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
        apresentacao: 'Conta de teste do agendador.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        areasAtuacao: [],
        especialidades: ['Planejamento Tributário'],
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
      userAgent: 'agendador-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

async function solicitar(extra: Record<string, string> = {}) {
  entrarComo(contas.cliente.token)
  const resultado = await criarOportunidade(formulario(extra))
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { oportunidadeId: string } }).dados.oportunidadeId
}

/** Empurra o prazo global para trás — é o vencimento sem esperar o relógio. */
async function vencer(id: string) {
  await db
    .update(oportunidades)
    .set({ expiraEm: new Date(Date.now() - 60_000) })
    .where(eq(oportunidades.id, id))
}

async function propor(chave: Chave, oportunidadeId: string) {
  entrarComo(contas[chave].token)
  return enviarProposta({ oportunidadeId, ...PROPOSTA })
}

/**
 * Um Atendimento real com prazo a `dias` de hoje.
 *
 * Nasce pelo caminho de sempre — solicitação, proposta, acordo, pagamento
 * simulado —, e não por um `insert` à mão: protocolo é gerado pelo domínio, e
 * um Atendimento montado por fora não teria o mesmo alcance nem a mesma
 * audiência que o aviso de prazo consulta.
 */
async function atendimentoComPrazo(dias: number) {
  const oportunidadeId = await solicitar()
  await propor('contador', oportunidadeId)

  entrarComo(contas.cliente.token)
  const minhas = await listarOportunidadesDoCliente(contas.cliente.id)
  const alvo = minhas.find((item) => item.id === oportunidadeId)!
  await aceitarProposta({ propostaId: alvo.propostas[0].id })
  const pagamento = await pagarAcordoSimulado({ oportunidadeId })
  if (!pagamento.sucesso) throw new Error(pagamento.mensagem)

  const [protocolo] = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(eq(atendimentos.oportunidadeId, oportunidadeId))

  await db
    .update(atendimentos)
    .set({ prazoEm: new Date(Date.now() + dias * 24 * 60 * 60 * 1000) })
    .where(eq(atendimentos.id, protocolo.id))

  return protocolo.id
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('autorização do endpoint do agendador', () => {
  const original = process.env.CRON_SECRET

  afterAll(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('sem a variável configurada, recusa em vez de liberar', () => {
    delete process.env.CRON_SECRET
    expect(autorizarCron('Bearer qualquer-coisa')).toEqual({
      autorizado: false,
      motivo: 'sem-configuracao',
    })
  })

  it('recusa chamada sem cabeçalho, com formato errado ou com segredo errado', () => {
    process.env.CRON_SECRET = 'segredo-de-teste'
    for (const cabecalho of [
      null,
      '',
      'segredo-de-teste',
      'Basic segredo-de-teste',
      'Bearer segredo-errado',
      'Bearer ',
    ]) {
      expect(autorizarCron(cabecalho)).toEqual({
        autorizado: false,
        motivo: 'credencial-invalida',
      })
    }
  })

  it('aceita apenas o Bearer com o segredo exato', () => {
    process.env.CRON_SECRET = 'segredo-de-teste'
    expect(autorizarCron('Bearer segredo-de-teste')).toEqual({ autorizado: true })
  })
})

describe('a rota do agendador', () => {
  const original = process.env.CRON_SECRET

  afterAll(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  /** Importa a rota só quando o teste roda: ela lê a variável no momento da chamada. */
  async function chamar(cabecalho?: string) {
    const { GET } = await import('@/app/api/cron/processar-prazos/route')
    const requisicao = new Request('http://localhost/api/cron/processar-prazos', {
      headers: cabecalho ? { authorization: cabecalho } : undefined,
    })
    return GET(requisicao as never)
  }

  it('recusa a chamada sem credencial, e sem contar nada', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste'
    const id = await solicitar()
    await vencer(id)

    const resposta = await chamar()
    expect(resposta.status).toBe(401)
    const corpo = await resposta.json()
    expect(corpo).toEqual({ erro: 'Não autorizado.' })
    // A recusa não vaza nada — nem o segredo, nem o que teria sido processado.
    expect(JSON.stringify(corpo)).not.toContain('segredo-de-teste')

    // E nada foi processado: a solicitação vencida continua marcada como aberta.
    const [linha] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.status).toBe('aberta')
  })

  it('sem a variável configurada, responde 503 em vez de processar', async () => {
    delete process.env.CRON_SECRET
    const resposta = await chamar('Bearer qualquer-coisa')
    expect(resposta.status).toBe(503)
  })

  it('com a credencial certa, processa e devolve só contadores', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste'
    const id = await solicitar()
    await vencer(id)

    const resposta = await chamar('Bearer segredo-de-teste')
    expect(resposta.status).toBe(200)
    const corpo = await resposta.json()
    expect(corpo.status).toBe('ok')
    expect(corpo.oportunidadesExpiradas).toBe(1)
    expect(corpo.falhas).toEqual([])
    // Nenhum identificador ou texto de solicitação volta na resposta.
    const texto = JSON.stringify(corpo)
    expect(texto).not.toContain(id)
    expect(texto).not.toContain('contabilidade')

    const [linha] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.status).toBe('expirada')
  })
})

describe('varredura de solicitações vencidas', () => {
  it('expira a pública vencida, avisa quem tem o que perder e limpa o banner', async () => {
    const id = await solicitar()
    await propor('contador', id)
    await vencer(id)

    const resumo = await processarPrazos()
    expect(resumo.oportunidadesExpiradas).toBe(1)
    expect(resumo.falhas).toEqual([])

    const [linha] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    // Expirada, nunca cancelada: o relógio não é ato de ninguém.
    expect(linha.status).toBe('expirada')

    // O Cliente dono e quem propôs. Ninguém mais — o contadorB só viu passar.
    const avisos = await db
      .select()
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.recursoId, id),
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.oportunidadeExpirada),
        ),
      )
    expect(avisos.map((a) => a.destinatarioId).sort()).toEqual(
      [contas.cliente.id, contas.contador.id].sort(),
    )

    // Sai do número do destaque de quem ainda poderia responder.
    expect(await contarDisponiveisPorOrigem(contas.contadorB.id)).toEqual({
      total: 0,
      diretas: 0,
    })
  })

  it('expira também a solicitação privada vencida', async () => {
    const id = await solicitar({ destinatarioId: contas.contador.id })
    await vencer(id)

    expect((await processarPrazos()).oportunidadesExpiradas).toBe(1)

    const [linha] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.status).toBe('expirada')
    expect(linha.visibilidade).toBe('privada')
    // Expirar não inventa motivo de encerramento: ela não foi encerrada.
    expect(linha.motivoEncerramento).toBeNull()
    expect(await contarDisponiveisPorOrigem(contas.contador.id)).toEqual({
      total: 0,
      diretas: 0,
    })
  })

  it('não toca em solicitação com acordo fechado', async () => {
    const id = await solicitar()
    await propor('contador', id)

    entrarComo(contas.cliente.token)
    const [antes] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect((await aceitarProposta({ propostaId: antes.propostas[0].id })).sucesso).toBe(
      true,
    )
    // Mesmo com o prazo global no passado: o acordo já encerrou a solicitação.
    await vencer(id)

    expect((await processarPrazos()).oportunidadesExpiradas).toBe(0)
    const [linha] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.status).toBe('encerrada')

    // E o pagamento do acordo continua possível depois da varredura.
    expect((await pagarAcordoSimulado({ oportunidadeId: id })).sucesso).toBe(true)
  })

  it('sem nada vencido, a execução termina limpa', async () => {
    await solicitar()
    const resumo = await processarPrazos()
    expect(resumo.oportunidadesExpiradas).toBe(0)
    expect(resumo.avisosDeExpiracao).toBe(0)
    expect(resumo.falhas).toEqual([])
    expect(resumo.duracaoMs).toBeGreaterThanOrEqual(0)
  })

  it('duas execuções, inclusive concorrentes, não duplicam aviso', async () => {
    const id = await solicitar()
    await vencer(id)

    const [a, b] = await Promise.all([
      processarOportunidadesVencidas(),
      processarOportunidadesVencidas(),
    ])
    // Quem alterou a linha é quem avisa: só uma das duas a alcança.
    expect(a.expiradas + b.expiradas).toBe(1)

    await processarOportunidadesVencidas()

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.recursoId, id),
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.oportunidadeExpirada),
        ),
      )
    expect(avisos).toHaveLength(1)
  })
})

describe('o agendador não substitui a validação transacional', () => {
  it('proposta vencida não é aceita, mesmo antes de a varredura rodar', async () => {
    const id = await solicitar()
    await propor('contador', id)

    // Só a validade da proposta vence; a solicitação continua no prazo.
    await db
      .update(oportunidadePropostas)
      .set({ validaAte: new Date(Date.now() - 60_000) })
      .where(eq(oportunidadePropostas.oportunidadeId, id))

    entrarComo(contas.cliente.token)
    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(vista.propostas[0].vigente).toBe(false)
    const aceite = await aceitarProposta({ propostaId: vista.propostas[0].id })
    expect(aceite.sucesso).toBe(false)
  })

  it('contraproposta de solicitação vencida não é acionável antes da varredura', async () => {
    const id = await solicitar()
    await propor('contador', id)

    entrarComo(contas.cliente.token)
    const [vista] = await listarOportunidadesDoCliente(contas.cliente.id)
    await vencer(id)

    // A coluna ainda diz `aberta` — e mesmo assim a negociação já morreu.
    const [linha] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(linha.status).toBe('aberta')

    const contra = await criarContraproposta({
      propostaId: vista.propostas[0].id,
      valor: '700,00',
    })
    expect(contra.sucesso).toBe(false)
    expect((await aceitarProposta({ propostaId: vista.propostas[0].id })).sucesso).toBe(
      false,
    )
    expect((await pagarAcordoSimulado({ oportunidadeId: id })).sucesso).toBe(false)
  })
})

describe('avisos de prazo saem do agendador, não da renderização', () => {
  it('a varredura global avisa a equipe sem ninguém abrir o painel', async () => {
    const atendimentoId = await atendimentoComPrazo(1)

    const criadas = await processarAvisosDePrazo()
    expect(criadas).toBeGreaterThan(0)

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.atendimentoId, atendimentoId),
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.prazoProximo),
        ),
      )
    expect(avisos).toHaveLength(1)
    expect(avisos[0].destinatarioId).toBe(contas.contador.id)
    // O Cliente não é cobrado por um compromisso interno da equipe.
    expect(avisos.map((a) => a.destinatarioId)).not.toContain(contas.cliente.id)
  })

  it('executar de novo — e em paralelo — não duplica o aviso do dia', async () => {
    const atendimentoId = await atendimentoComPrazo(1)

    await Promise.all([processarAvisosDePrazo(), processarAvisosDePrazo()])
    await processarPrazos()

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.atendimentoId, atendimentoId),
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.prazoProximo),
        ),
      )
    expect(avisos).toHaveLength(1)
  })

  it('Atendimento concluído ou fora da janela não gera aviso', async () => {
    await atendimentoComPrazo(30)
    const concluido = await atendimentoComPrazo(1)
    await db
      .update(atendimentos)
      .set({ status: 'concluido' })
      .where(eq(atendimentos.id, concluido))

    expect(await processarAvisosDePrazo()).toBe(0)
  })
})

describe('convites vencidos', () => {
  it('entram na mesma varredura e o resumo os conta', async () => {
    const resumo = await processarPrazos()
    // Sem convite vencido no cenário, o contador é zero — o que interessa aqui
    // é que a rotina roda dentro da varredura e não falha.
    expect(resumo.convitesExpirados).toBe(0)
    expect(resumo.falhas).toEqual([])
  })
})
