import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  configuracoesPlataforma,
  eventosAuditoria,
  notificacoes,
  oportunidadeContrapropostas,
  oportunidadeDispensas,
  oportunidadePropostas,
  oportunidades,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { definirPrazoOportunidade } from '@/features/configuracoes/actions/configuracoes'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { CHAVE_PRAZO_OPORTUNIDADE } from '@/features/configuracoes/lib/configuracoes'
import {
  aceitarProposta,
  criarContraproposta,
  responderContraproposta,
} from '@/features/oportunidades/actions/negociacao'
import {
  carregarMinhasOportunidades,
  criarOportunidade,
} from '@/features/oportunidades/actions/oportunidades'
import {
  carregarOportunidadesDisponiveis,
  enviarProposta,
  marcarSemInteresse,
} from '@/features/oportunidades/actions/propostas'
import { LIMITE_MENSAGEM_PROPOSTA } from '@/features/oportunidades/constants/oportunidade'
import { contarOportunidadesDisponiveis } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import { limitarValidade } from '@/features/oportunidades/lib/vigencia'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@negociacao.teste'

type Chave = 'cliente' | 'outroCliente' | 'gestor' | 'contadorA' | 'contadorB'

const DEFINICOES: Record<
  Chave,
  { perfil: string; prestador?: 'profissional'; tipoProfissional?: string }
> = {
  cliente: { perfil: 'cliente' },
  outroCliente: { perfil: 'cliente' },
  gestor: { perfil: 'gestor_vincis' },
  contadorA: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
  },
  contadorB: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
  },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SOLICITACAO = {
  categoria: 'contabilidade',
  descricao:
    'Preciso organizar a contabilidade da empresa e as obrigações do primeiro ano.',
  abrangencia: 'BR',
}

const PROPOSTA = {
  mensagem: 'Cuido da abertura e das obrigações fiscais do primeiro ano.',
  valor: '850,00',
  prazoEstimadoDias: 10,
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
  await db
    .delete(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_PRAZO_OPORTUNIDADE))
  if (!ids.length) return

  const propostas = await db
    .select({ id: oportunidadePropostas.id })
    .from(oportunidadePropostas)
    .where(inArray(oportunidadePropostas.prestadorId, ids))
  if (propostas.length) {
    await db.delete(oportunidadeContrapropostas).where(
      inArray(
        oportunidadeContrapropostas.propostaId,
        propostas.map(({ id }) => id),
      ),
    )
  }
  await db
    .delete(oportunidadeDispensas)
    .where(inArray(oportunidadeDispensas.prestadorId, ids))
  await db
    .delete(oportunidadePropostas)
    .where(inArray(oportunidadePropostas.prestadorId, ids))
  await db
    .delete(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, ids))
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
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
        nome: `Negociacao ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193500${String(i).padStart(4, '0')}`,
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
        tipoProfissional: def.tipoProfissional!,
        apresentacao: 'Conta de teste de negociação.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
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
      userAgent: 'negociacao-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

async function solicitar() {
  entrarComo(contas.cliente.token)
  const resultado = await criarOportunidade(formulario())
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { oportunidadeId: string } }).dados
    .oportunidadeId
}

async function propor(chave: Chave, oportunidadeId: string, extra = {}) {
  entrarComo(contas[chave].token)
  const resultado = await enviarProposta({
    ...PROPOSTA,
    oportunidadeId,
    ...extra,
  })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  const [proposta] = await db
    .select({ id: oportunidadePropostas.id })
    .from(oportunidadePropostas)
    .where(
      and(
        eq(oportunidadePropostas.oportunidadeId, oportunidadeId),
        eq(oportunidadePropostas.prestadorId, contas[chave].id),
      ),
    )
  return proposta.id
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('mensagem da proposta e campos', () => {
  it('aceita o limite exato de 500 e recusa um caractere a mais', async () => {
    expect(LIMITE_MENSAGEM_PROPOSTA).toBe(500)
    const id = await solicitar()
    entrarComo(contas.contadorA.token)

    const noLimite = 'a'.repeat(LIMITE_MENSAGEM_PROPOSTA)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id, mensagem: noLimite }))
        .sucesso,
    ).toBe(true)

    const acima = 'a'.repeat(LIMITE_MENSAGEM_PROPOSTA + 1)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id, mensagem: acima }))
        .sucesso,
    ).toBe(false)

    const [gravada] = await db
      .select({ mensagem: oportunidadePropostas.mensagem })
      .from(oportunidadePropostas)
    // Recusado, não truncado: o texto gravado é o que passou pela validação.
    expect(gravada.mensagem).toHaveLength(LIMITE_MENSAGEM_PROPOSTA)
  })

  it('mensagem antiga acima de 500 continua íntegra e legível', async () => {
    // Simula o registro gravado quando o teto era 1.500: a redução do limite
    // não pode reescrever, truncar nem esconder o que já estava no banco.
    const id = await solicitar()
    entrarComo(contas.contadorA.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    const antiga = 'b'.repeat(1500)
    await db
      .update(oportunidadePropostas)
      .set({ mensagem: antiga })
      .where(eq(oportunidadePropostas.oportunidadeId, id))

    entrarComo(contas.cliente.token)
    const lista = await carregarMinhasOportunidades()
    const solicitacao = lista.dados?.find((item) => item.id === id)
    expect(solicitacao?.propostas[0]?.mensagem).toHaveLength(1500)
  })

  it('valor e prazo vazios são aceitos e ficam nulos', async () => {
    const id = await solicitar()
    entrarComo(contas.contadorA.token)
    const resultado = await enviarProposta({
      oportunidadeId: id,
      mensagem: PROPOSTA.mensagem,
      valor: '',
    })
    expect(resultado.sucesso).toBe(true)

    const [gravada] = await db.select().from(oportunidadePropostas)
    expect(gravada.valorCentavos).toBeNull()
    expect(gravada.prazoEstimadoDias).toBeNull()
  })

  it('o Cliente recebe o perfil público real de quem propôs', async () => {
    const id = await solicitar()
    await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    const minhas = await carregarMinhasOportunidades()
    const [proposta] = minhas.dados!.find((item) => item.id === id)!.propostas

    expect(proposta.perfilPublico.nome).toBe('Negociacao contadorA')
    expect(proposta.perfilPublico.destaque).toBe('Planejamento Tributário')
    // A rota é montada pela plataforma a partir do id — o prestador não informa
    // endereço de perfil em campo nenhum.
    expect(proposta.perfilPublico.perfilUrl).toBe(
      `/perfil-profissional?prestador=${contas.contadorA.id}`,
    )
    expect(JSON.stringify(proposta)).not.toContain(SUFIXO)
  })
})

describe('contadores da solicitação', () => {
  it('separa propostas de não interessados, sem revelar quem dispensou', async () => {
    const id = await solicitar()
    await propor('contadorA', id)
    entrarComo(contas.contadorB.token)
    await marcarSemInteresse({ oportunidadeId: id })

    entrarComo(contas.cliente.token)
    const minhas = await carregarMinhasOportunidades()
    const oportunidade = minhas.dados!.find((item) => item.id === id)!

    expect(oportunidade.totalPropostas).toBe(1)
    expect(oportunidade.totalSemInteresse).toBe(1)
    // A identidade de quem dispensou não chega ao Cliente.
    expect(JSON.stringify(oportunidade)).not.toContain(contas.contadorB.id)
  })

  it('a dispensa de um prestador não afeta a fila do outro', async () => {
    const id = await solicitar()
    entrarComo(contas.contadorB.token)
    await marcarSemInteresse({ oportunidadeId: id })

    expect(await contarOportunidadesDisponiveis(contas.contadorB.id)).toBe(0)
    expect(await contarOportunidadesDisponiveis(contas.contadorA.id)).toBe(1)
  })
})

describe('contraproposta', () => {
  it('o Cliente dono contrapropõe e o prestador recebe aviso', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    const resultado = await criarContraproposta({
      propostaId,
      valor: '700,00',
      mensagem: 'Consigo fechar nesse valor.',
    })
    expect(resultado.sucesso).toBe(true)

    const [contra] = await db.select().from(oportunidadeContrapropostas)
    expect(contra.valorCentavos).toBe(70000)
    expect(contra.status).toBe('pendente')
    expect(contra.autorId).toBe(contas.cliente.id)

    const avisos = await db
      .select({ tipo: notificacoes.tipo })
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.contadorA.id))
    expect(avisos.map((a) => a.tipo)).toContain('contraproposta_oportunidade')
  })

  it('outro Cliente e o concorrente não negociam a proposta alheia', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    for (const chave of ['outroCliente', 'contadorB'] as const) {
      entrarComo(contas[chave].token)
      expect(
        (await criarContraproposta({ propostaId, valor: '500,00' })).sucesso,
      ).toBe(false)
    }
    sairDaSessao()
    expect(
      (await criarContraproposta({ propostaId, valor: '500,00' })).sucesso,
    ).toBe(false)
    expect(await db.select().from(oportunidadeContrapropostas)).toHaveLength(0)
  })

  it('valor zerado não vira contraproposta', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    entrarComo(contas.cliente.token)
    expect((await criarContraproposta({ propostaId, valor: '0' })).sucesso).toBe(
      false,
    )
  })

  it('só existe uma contraproposta pendente por vez', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const segunda = await criarContraproposta({ propostaId, valor: '650,00' })
    expect(segunda.sucesso).toBe(false)
    expect(await db.select().from(oportunidadeContrapropostas)).toHaveLength(1)
  })

  it('recusar mantém a proposta original válida e libera nova rodada', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const [contra] = await db.select().from(oportunidadeContrapropostas)

    entrarComo(contas.contadorA.token)
    const recusa = await responderContraproposta({
      contrapropostaId: contra.id,
      decisao: 'recusar',
    })
    expect(recusa.sucesso).toBe(true)

    const [proposta] = await db.select().from(oportunidadePropostas)
    // A proposta original segue de pé — recusar a contraproposta não a derruba.
    expect(proposta.status).toBe('enviada')

    // E o Cliente pode tentar de novo.
    entrarComo(contas.cliente.token)
    expect(
      (await criarContraproposta({ propostaId, valor: '780,00' })).sucesso,
    ).toBe(true)
    expect(await db.select().from(oportunidadeContrapropostas)).toHaveLength(2)
  })

  it('aceitar a contraproposta fecha o acordo pelo valor dela', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const [contra] = await db.select().from(oportunidadeContrapropostas)

    entrarComo(contas.contadorA.token)
    expect(
      (await responderContraproposta({
        contrapropostaId: contra.id,
        decisao: 'aceitar',
      })).sucesso,
    ).toBe(true)

    const [proposta] = await db.select().from(oportunidadePropostas)
    expect(proposta.status).toBe('aceita')
    expect(proposta.valorAcordadoCentavos).toBe(70000)
    expect(proposta.aceitaEm).not.toBeNull()
  })

  it('contraproposta já respondida não é respondida de novo', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const [contra] = await db.select().from(oportunidadeContrapropostas)

    entrarComo(contas.contadorA.token)
    await responderContraproposta({
      contrapropostaId: contra.id,
      decisao: 'recusar',
    })
    const segunda = await responderContraproposta({
      contrapropostaId: contra.id,
      decisao: 'aceitar',
    })
    expect(segunda.sucesso).toBe(false)
  })

  it('o concorrente não responde a contraproposta de outro', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const [contra] = await db.select().from(oportunidadeContrapropostas)

    entrarComo(contas.contadorB.token)
    expect(
      (await responderContraproposta({
        contrapropostaId: contra.id,
        decisao: 'aceitar',
      })).sucesso,
    ).toBe(false)
  })

  it('o histórico preserva cada rodada com data e resultado', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '700,00' })
    const [primeira] = await db.select().from(oportunidadeContrapropostas)
    entrarComo(contas.contadorA.token)
    await responderContraproposta({
      contrapropostaId: primeira.id,
      decisao: 'recusar',
    })
    entrarComo(contas.cliente.token)
    await criarContraproposta({ propostaId, valor: '780,00' })

    const minhas = await carregarMinhasOportunidades()
    const [proposta] = minhas.dados!.find((item) => item.id === id)!.propostas
    expect(proposta.historicoContrapropostas).toHaveLength(1)
    expect(proposta.historicoContrapropostas[0].status).toBe('recusada')
    expect(proposta.historicoContrapropostas[0].respondidaEm).not.toBeNull()
    expect(proposta.contrapropostaPendente?.valorCentavos).toBe(78000)
  })
})

describe('aceite e concorrência', () => {
  it('o Cliente dono aceita e o acordo é registrado', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    entrarComo(contas.cliente.token)
    expect((await aceitarProposta({ propostaId })).sucesso).toBe(true)

    const [proposta] = await db.select().from(oportunidadePropostas)
    expect(proposta.status).toBe('aceita')
    expect(proposta.valorAcordadoCentavos).toBe(85000)
  })

  it('duas propostas não podem ser aceitas para a mesma oportunidade', async () => {
    const id = await solicitar()
    const primeira = await propor('contadorA', id)
    const segunda = await propor('contadorB', id)

    entrarComo(contas.cliente.token)
    expect((await aceitarProposta({ propostaId: primeira })).sucesso).toBe(true)
    // Segunda tentativa (outra aba, outro clique) não fecha um segundo acordo.
    expect((await aceitarProposta({ propostaId: segunda })).sucesso).toBe(false)

    const aceitas = await db
      .select()
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.status, 'aceita'))
    expect(aceitas).toHaveLength(1)
  })

  it('aceitar duas vezes a mesma proposta não duplica o acordo', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId })
    expect((await aceitarProposta({ propostaId })).sucesso).toBe(false)
  })

  it('quem não é dono não aceita', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)

    for (const chave of ['outroCliente', 'contadorA', 'contadorB'] as const) {
      entrarComo(contas[chave].token)
      expect((await aceitarProposta({ propostaId })).sucesso).toBe(false)
    }
  })

  it('o aceite encerra a solicitação para os demais prestadores', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId })

    expect(await contarOportunidadesDisponiveis(contas.contadorB.id)).toBe(0)
    entrarComo(contas.contadorB.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)
  })
})

describe('validades e expiração', () => {
  it('a validade da proposta nunca ultrapassa o prazo da oportunidade', () => {
    const limite = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const { validaAte, limitada } = limitarValidade(168, limite)
    expect(limitada).toBe(true)
    expect(validaAte.getTime()).toBe(limite.getTime())

    const dentro = limitarValidade(1, limite)
    expect(dentro.limitada).toBe(false)
  })

  it('o prazo global vem da configuração da Gestão', async () => {
    entrarComo(contas.gestor.token)
    expect((await definirPrazoOportunidade({ horas: 24 })).sucesso).toBe(true)
    expect(await obterPrazoOportunidadeHoras()).toBe(24)

    const id = await solicitar()
    const [registro] = await db
      .select({ expiraEm: oportunidades.expiraEm })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    const horas =
      (registro.expiraEm!.getTime() - Date.now()) / (60 * 60 * 1000)
    expect(horas).toBeGreaterThan(23)
    expect(horas).toBeLessThanOrEqual(24)
  })

  it('só a Gestão altera o prazo global', async () => {
    for (const chave of ['cliente', 'contadorA'] as const) {
      entrarComo(contas[chave].token)
      expect((await definirPrazoOportunidade({ horas: 12 })).sucesso).toBe(false)
    }
    sairDaSessao()
    expect((await definirPrazoOportunidade({ horas: 12 })).sucesso).toBe(false)
  })

  it('proposta vencida não é aceita nem contraposta', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    // Vence a proposta sem tocar na oportunidade.
    await db
      .update(oportunidadePropostas)
      .set({ validaAte: new Date(Date.now() - 60_000) })
      .where(eq(oportunidadePropostas.id, propostaId))

    entrarComo(contas.cliente.token)
    expect((await aceitarProposta({ propostaId })).sucesso).toBe(false)
    expect(
      (await criarContraproposta({ propostaId, valor: '700,00' })).sucesso,
    ).toBe(false)
  })

  it('oportunidade expirada não recebe proposta, contraproposta nem aceite', async () => {
    const id = await solicitar()
    const propostaId = await propor('contadorA', id)
    await db
      .update(oportunidades)
      .set({ expiraEm: new Date(Date.now() - 60_000) })
      .where(eq(oportunidades.id, id))

    entrarComo(contas.contadorB.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)

    entrarComo(contas.cliente.token)
    expect(
      (await criarContraproposta({ propostaId, valor: '700,00' })).sucesso,
    ).toBe(false)
    expect((await aceitarProposta({ propostaId })).sucesso).toBe(false)
  })

  it('expirar materializa o status, preserva histórico e limpa o banner', async () => {
    const id = await solicitar()
    await propor('contadorA', id)
    await db
      .update(oportunidades)
      .set({ expiraEm: new Date(Date.now() - 60_000) })
      .where(eq(oportunidades.id, id))

    // A leitura do Cliente materializa o vencimento.
    entrarComo(contas.cliente.token)
    const minhas = await carregarMinhasOportunidades()
    const oportunidade = minhas.dados!.find((item) => item.id === id)!
    expect(oportunidade.status).toBe('expirada')
    expect(oportunidade.ativa).toBe(false)
    // Histórico intacto: a proposta continua lá, apenas não acionável.
    expect(oportunidade.totalPropostas).toBe(1)
    expect(oportunidade.propostas[0].vigente).toBe(false)

    const [registro] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    // Expirada, nunca cancelada: o relógio não é ato de ninguém.
    expect(registro.status).toBe('expirada')

    expect(await contarOportunidadesDisponiveis(contas.contadorB.id)).toBe(0)
    entrarComo(contas.contadorB.token)
    const vitrine = await carregarOportunidadesDisponiveis()
    expect(vitrine.dados?.lista.map((item) => item.id)).not.toContain(id)
  })
})
