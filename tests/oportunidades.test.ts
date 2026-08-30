import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  eventosAuditoria,
  notificacoes,
  oportunidadeArquivos,
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
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { listarNotificacoesDoUsuario } from '@/features/notificacoes/queries/listar-notificacoes'
import {
  carregarMinhasOportunidades,
  criarOportunidade,
} from '@/features/oportunidades/actions/oportunidades'
import {
  carregarOportunidadesDisponiveis,
  enviarProposta,
  marcarSemInteresse,
} from '@/features/oportunidades/actions/propostas'
import { obterArquivoDaOportunidade } from '@/features/oportunidades/queries/obter-arquivo-da-oportunidade'
import {
  CATEGORIAS_OPORTUNIDADE,
  CATEGORIA_OPORTUNIDADE,
  LIMITE_DESCRICAO_OPORTUNIDADE,
} from '@/features/oportunidades/constants/oportunidade'
import { contarOportunidadesDisponiveis } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@oportunidades.teste'

type Chave =
  | 'clienteA'
  | 'clienteB'
  | 'clienteSemConfirmar'
  | 'contador'
  | 'especialistaFiscal'
  | 'advogado'
  | 'colabFiscal'
  | 'colabMarketing'
  | 'contadorPendente'
  | 'gestorProfissional'

/**
 * O elenco existe para provar a regra em todas as pontas: quem casa pela
 * categoria declarada, quem casa pela área de atuação escrita, quem não casa
 * por nenhuma das duas, quem não pode operar e quem ainda não confirmou a conta.
 */
const DEFINICOES: Record<
  Chave,
  {
    perfil: string
    confirmada?: boolean
    perfisExtras?: string[]
    prestador?: 'profissional' | 'colaborador'
    tipoProfissional?: string
    statusAnalise?: string
    areasAtuacao?: string[]
  }
> = {
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
  clienteSemConfirmar: { perfil: 'cliente', confirmada: false },
  contador: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
  // Prova o agrupamento público: o Cliente escolhe "Contabilidade" e esta
  // pessoa, que declarou `especialista_fiscal`, precisa ser alcançada.
  especialistaFiscal: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'especialista_fiscal',
    statusAnalise: 'aprovado',
  },
  advogado: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'advocacia',
    statusAnalise: 'aprovado',
  },
  colabFiscal: {
    perfil: 'colaborador',
    prestador: 'colaborador',
    tipoProfissional: 'colaborador',
    statusAnalise: 'ativo',
    areasAtuacao: ['Rotinas fiscais e tributárias'],
  },
  colabMarketing: {
    perfil: 'colaborador',
    prestador: 'colaborador',
    tipoProfissional: 'colaborador',
    statusAnalise: 'ativo',
    areasAtuacao: ['Fotografia de produto'],
  },
  contadorPendente: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'em_analise',
  },
  // Gestor da Plataforma que também presta serviço: a conta com que a Vincis é
  // operada e testada de ponta a ponta.
  gestorProfissional: {
    perfil: 'profissional',
    perfisExtras: ['gestor_vincis'],
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SOLICITACAO = {
  categoria: 'contabilidade',
  descricao:
    'Preciso abrir uma empresa de prestação de serviços e organizar os impostos do primeiro ano.',
  abrangencia: 'BR',
}

/** A action recebe `FormData` por causa dos anexos; os testes montam o mesmo. */
function montarFormulario(
  dados: Record<string, string> = {},
  especialidades: string[] = [],
) {
  const formulario = new FormData()
  for (const [chave, valor] of Object.entries({ ...SOLICITACAO, ...dados })) {
    formulario.set(chave, valor)
  }
  for (const item of especialidades) formulario.append('especialidades', item)
  return formulario
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  // Anexos e propostas apontam para as oportunidades: saem primeiro.
  await db
    .delete(oportunidadeArquivos)
    .where(inArray(oportunidadeArquivos.remetenteId, ids))
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
    const confirmada = def.confirmada ?? true
    const nomesDePerfil = [def.perfil, ...(def.perfisExtras ?? [])]
    for (const nome of nomesDePerfil) {
      await db.insert(perfis).values({ nome }).onConflictDoNothing()
    }
    const perfisDaConta = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(inArray(perfis.nome, nomesDePerfil))

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Oportunidade ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193400${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: confirmada,
        emailVerificadoEm: confirmada ? new Date() : null,
      })
      .returning({ id: usuarios.id })

    for (const { id: perfilId } of perfisDaConta) {
      await db.insert(usuariosPerfis).values({ usuarioId: usuario.id, perfilId })
    }

    if (def.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: def.prestador,
        tipoProfissional: def.tipoProfissional!,
        areasAtuacao: def.areasAtuacao ?? [],
        apresentacao: 'Conta de teste de oportunidades.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: def.statusAnalise!,
      })
    }

    // A conta não confirmada também tem sessão gravada: é justamente o cenário
    // em que a interface poderia achar que a pessoa está apta.
    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'oportunidades-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

async function solicitarComo(
  chave: Chave,
  dados: Record<string, string> = {},
  especialidades: string[] = [],
) {
  entrarComo(contas[chave].token)
  const resultado = await criarOportunidade(
    montarFormulario(dados, especialidades),
  )
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { oportunidadeId: string } }).dados
    .oportunidadeId
}

async function listarComo(chave: Chave) {
  entrarComo(contas[chave].token)
  const resultado = await carregarOportunidadesDisponiveis()
  return resultado.dados
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('quem pode solicitar', () => {
  it('Cliente confirmado e logado cria a solicitação', async () => {
    const id = await solicitarComo('clienteA')
    const [registro] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))

    expect(registro.clienteUsuarioId).toBe(contas.clienteA.id)
    expect(registro.categoria).toBe('contabilidade')
    expect(registro.abrangencia).toBe('BR')
    expect(registro.status).toBe('aberta')
    // O título é derivado da descrição — o formulário não pede assunto.
    expect(registro.titulo.length).toBeGreaterThan(0)
  })

  it('Cliente cadastrado e ainda não confirmado não cria', async () => {
    entrarComo(contas.clienteSemConfirmar.token)
    const resultado = await criarOportunidade(montarFormulario())

    expect(resultado.sucesso).toBe(false)
    // A recusa diz o motivo certo: mandar "entre na sua conta" para quem já
    // está logado seria orientação errada.
    expect(resultado.contaNaoConfirmada).toBe(true)
    expect(resultado.precisaEntrar).toBe(false)
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('visitante não cria, e nada é enviado automaticamente por ter preenchido', async () => {
    sairDaSessao()
    const resultado = await criarOportunidade(montarFormulario())

    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(true)
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('prestador não solicita orçamento', async () => {
    entrarComo(contas.contador.token)
    expect((await criarOportunidade(montarFormulario())).sucesso).toBe(false)
    entrarComo(contas.colabFiscal.token)
    expect((await criarOportunidade(montarFormulario())).sucesso).toBe(false)
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('o Gestor da Plataforma solicita orçamento mesmo sendo Profissional', async () => {
    // A restrição continua valendo para todo prestador; a conta que administra
    // e testa a plataforma é a única exceção, e ela é declarada uma vez só em
    // `usuarios/lib/capacidades`.
    entrarComo(contas.gestorProfissional.token)
    expect((await criarOportunidade(montarFormulario())).sucesso).toBe(true)
    expect(await db.select().from(oportunidades)).toHaveLength(1)
  })
})

describe('dados da solicitação', () => {
  it('a interface pública oferece exatamente duas categorias', () => {
    expect([...CATEGORIAS_OPORTUNIDADE]).toEqual(['contabilidade', 'advocacia'])
    expect(CATEGORIA_OPORTUNIDADE.contabilidade.rotulo).toBe('Contabilidade')
    expect(CATEGORIA_OPORTUNIDADE.advocacia.rotulo).toBe('Jurídico - Advogado')
    // Nenhum rótulo público expõe o enquadramento técnico interno.
    const rotulos = CATEGORIAS_OPORTUNIDADE.map(
      (c) => CATEGORIA_OPORTUNIDADE[c].rotulo,
    ).join(' ')
    expect(rotulos).not.toContain('Especialista Fiscal')
    expect(rotulos).not.toContain('Consultoria')
  })

  it('categoria fora das duas públicas é rejeitada no servidor', async () => {
    for (const categoria of ['consultoria', 'especialista_fiscal', 'juridico']) {
      entrarComo(contas.clienteA.token)
      const resultado = await criarOportunidade(
        montarFormulario({ categoria }),
      )
      expect(resultado.sucesso).toBe(false)
    }
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('as duas categorias públicas são aceitas', async () => {
    for (const categoria of ['contabilidade', 'advocacia']) {
      entrarComo(contas.clienteA.token)
      const resultado = await criarOportunidade(montarFormulario({ categoria }))
      expect(resultado.sucesso).toBe(true)
    }
  })

  it('abrangência aceita BR e UF, e recusa o resto', async () => {
    const nacional = await solicitarComo('clienteA', { abrangencia: 'BR' })
    const estadual = await solicitarComo('clienteA', { abrangencia: 'MG' })

    const linhas = await db
      .select({ id: oportunidades.id, abrangencia: oportunidades.abrangencia })
      .from(oportunidades)
    expect(linhas.find((l) => l.id === nacional)?.abrangencia).toBe('BR')
    expect(linhas.find((l) => l.id === estadual)?.abrangencia).toBe('MG')

    entrarComo(contas.clienteA.token)
    expect(
      (await criarOportunidade(montarFormulario({ abrangencia: 'XX' }))).sucesso,
    ).toBe(false)
    expect(
      (await criarOportunidade(montarFormulario({ abrangencia: 'São Paulo' })))
        .sucesso,
    ).toBe(false)
  })

  it('cidade digitada não faz parte do fluxo', async () => {
    // O campo saiu do formulário e da tabela: mandá-lo é inócuo, e nenhuma
    // coluna de cidade existe para recebê-lo.
    const id = await solicitarComo('clienteA', { cidade: 'São Paulo' })
    const [registro] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(Object.keys(registro)).not.toContain('cidade')
  })

  it('valor pretendido é opcional e persistido quando informado', async () => {
    const semValor = await solicitarComo('clienteA')
    const comValor = await solicitarComo('clienteA', {
      valorPretendido: '1.500,00',
    })

    const linhas = await db
      .select({
        id: oportunidades.id,
        valor: oportunidades.valorPretendidoCentavos,
      })
      .from(oportunidades)
    expect(linhas.find((l) => l.id === semValor)?.valor).toBeNull()
    expect(linhas.find((l) => l.id === comValor)?.valor).toBe(150000)
  })

  it('especialidades da categoria são persistidas', async () => {
    const escolhidas = [
      CATEGORIA_OPORTUNIDADE.contabilidade.especialidades[0],
      CATEGORIA_OPORTUNIDADE.contabilidade.especialidades[1],
    ]
    const id = await solicitarComo('clienteA', {}, escolhidas)

    const [registro] = await db
      .select()
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(registro.especialidades).toEqual(escolhidas)
  })

  it('especialidade inventada ou de outra categoria é rejeitada', async () => {
    entrarComo(contas.clienteA.token)
    expect(
      (await criarOportunidade(montarFormulario({}, ['Astrologia Fiscal'])))
        .sucesso,
    ).toBe(false)

    // Existe na plataforma, mas pertence à outra categoria pública.
    expect(
      (
        await criarOportunidade(
          montarFormulario({}, [
            CATEGORIA_OPORTUNIDADE.advocacia.especialidades[0],
          ]),
        )
      ).sucesso,
    ).toBe(false)

    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })

  it('descrição curta demais é recusada no servidor', async () => {
    entrarComo(contas.clienteA.token)
    const resultado = await criarOportunidade(
      montarFormulario({ descricao: 'preciso de ajuda' }),
    )
    expect(resultado.sucesso).toBe(false)
  })

  it('descrição aceita o limite exato e recusa um caractere a mais', async () => {
    entrarComo(contas.clienteA.token)
    const noLimite = 'a'.repeat(LIMITE_DESCRICAO_OPORTUNIDADE)
    expect(
      (await criarOportunidade(montarFormulario({ descricao: noLimite })))
        .sucesso,
    ).toBe(true)

    entrarComo(contas.clienteA.token)
    const acima = 'a'.repeat(LIMITE_DESCRICAO_OPORTUNIDADE + 1)
    const resultado = await criarOportunidade(
      montarFormulario({ descricao: acima }),
    )
    // Recusa explícita — nada é truncado em silêncio.
    expect(resultado.sucesso).toBe(false)

    const [gravada] = await db.select().from(oportunidades)
    expect(gravada.descricao).toHaveLength(LIMITE_DESCRICAO_OPORTUNIDADE)
  })

  it('valor pretendido zerado ou negativo é recusado, não vira "não informado"', async () => {
    for (const valorPretendido of ['0', '0,00', '-50']) {
      entrarComo(contas.clienteA.token)
      expect(
        (await criarOportunidade(montarFormulario({ valorPretendido }))).sucesso,
      ).toBe(false)
    }
    expect(await db.select().from(oportunidades)).toHaveLength(0)
  })
})

describe('quem recebe a oportunidade', () => {
  it('avisa profissionais da categoria e colaboradores da área', async () => {
    const id = await solicitarComo('clienteA')

    const avisadas = await db
      .select({ destinatarioId: notificacoes.destinatarioId })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.recursoId, id),
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.oportunidadeDisponivel),
        ),
      )
    const avisados = avisadas.map(({ destinatarioId }) => destinatarioId)

    expect(avisados).toContain(contas.contador.id)
    // Agrupamento público: "Contabilidade" alcança também o especialista
    // fiscal, sem que o tipo interno dele tenha sido renomeado ou fundido.
    expect(avisados).toContain(contas.especialistaFiscal.id)
    expect(avisados).toContain(contas.colabFiscal.id)
    expect(avisados).not.toContain(contas.advogado.id)
    expect(avisados).not.toContain(contas.colabMarketing.id)
    // Quem ainda não foi habilitado não recebe trabalho pela plataforma.
    expect(avisados).not.toContain(contas.contadorPendente.id)
    // E o Cliente não é avisado da própria solicitação.
    expect(avisados).not.toContain(contas.clienteA.id)
  })

  it('o aviso do sino leva à tela de Oportunidades', async () => {
    const id = await solicitarComo('clienteA')
    const [aviso] = await listarNotificacoesDoUsuario(contas.contador.id)

    expect(aviso.tipo).toBe(TIPOS_NOTIFICACAO.oportunidadeDisponivel)
    expect(aviso.recursoTipo).toBe('oportunidade')
    expect(aviso.destino).toEqual({
      pagina: 'oportunidades',
      oportunidadeId: id,
    })
  })

  it('a vitrine mostra só as compatíveis', async () => {
    const id = await solicitarComo('clienteA')

    const doContador = await listarComo('contador')
    expect(doContador?.lista.map((item) => item.id)).toContain(id)
    expect(doContador?.disponiveis).toBe(1)

    const doEspecialista = await listarComo('especialistaFiscal')
    expect(doEspecialista?.lista.map((item) => item.id)).toContain(id)

    const doAdvogado = await listarComo('advogado')
    expect(doAdvogado?.lista.map((item) => item.id)).not.toContain(id)

    const doColabMarketing = await listarComo('colabMarketing')
    expect(doColabMarketing?.lista).toHaveLength(0)

    const doPendente = await listarComo('contadorPendente')
    expect(doPendente?.lista).toHaveLength(0)
  })

  it('a especialidade opcional não estreita quem recebe', async () => {
    // Regra desta etapa: especialidade é informação para quem responde, não
    // filtro de distribuição. Marcar uma não pode esvaziar a fila de ninguém.
    const id = await solicitarComo('clienteA', {}, [
      CATEGORIA_OPORTUNIDADE.contabilidade.especialidades[0],
    ])
    const doContador = await listarComo('contador')
    const vista = doContador?.lista.find((item) => item.id === id)

    expect(vista).toBeDefined()
    expect(vista?.especialidades).toEqual([
      CATEGORIA_OPORTUNIDADE.contabilidade.especialidades[0],
    ])
  })

  it('a vitrine não expõe contato do Cliente', async () => {
    await solicitarComo('clienteA')
    const [oportunidade] = (await listarComo('contador'))!.lista

    expect(oportunidade.clienteNome).toBe('Oportunidade clienteA')
    expect(JSON.stringify(oportunidade)).not.toContain(SUFIXO)
    expect(JSON.stringify(oportunidade)).not.toContain('1193400')
  })
})

describe('anexos', () => {
  /** Grava o anexo direto: o teste é da autorização, não do armazenamento. */
  async function anexar(oportunidadeId: string, remetenteId: string) {
    const chave = `oportunidades/${oportunidadeId}/arquivos/${randomUUID()}.pdf`
    const [arquivo] = await db
      .insert(oportunidadeArquivos)
      .values({
        oportunidadeId,
        nome: 'contrato-social.pdf',
        tipoMime: 'application/pdf',
        tamanhoBytes: 1024,
        remetenteId,
        chave,
      })
      .returning({ id: oportunidadeArquivos.id })
    return { id: arquivo.id, chave }
  }

  it('o Cliente dono e o prestador compatível alcançam o anexo', async () => {
    const id = await solicitarComo('clienteA')
    const { id: arquivoId } = await anexar(id, contas.clienteA.id)

    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: id,
        arquivoId,
        usuarioId: contas.clienteA.id,
      }),
    ).not.toBeNull()
    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: id,
        arquivoId,
        usuarioId: contas.contador.id,
      }),
    ).not.toBeNull()
  })

  it('quem não tem vínculo não alcança o anexo, mesmo com o id em mãos', async () => {
    const id = await solicitarComo('clienteA')
    const { id: arquivoId } = await anexar(id, contas.clienteA.id)

    for (const chave of ['clienteB', 'advogado', 'contadorPendente'] as const) {
      expect(
        await obterArquivoDaOportunidade({
          oportunidadeId: id,
          arquivoId,
          usuarioId: contas[chave].id,
        }),
      ).toBeNull()
    }
  })

  it('id de arquivo de outra solicitação não vaza por uma solicitação legítima', async () => {
    const daClienteA = await solicitarComo('clienteA')
    const daClienteB = await solicitarComo('clienteB')
    const { id: arquivoDeB } = await anexar(daClienteB, contas.clienteB.id)

    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: daClienteA,
        arquivoId: arquivoDeB,
        usuarioId: contas.clienteA.id,
      }),
    ).toBeNull()
  })

  it('o anexo aparece para o prestador com rota autorizada, nunca com a chave', async () => {
    const id = await solicitarComo('clienteA')
    const { id: arquivoId, chave } = await anexar(id, contas.clienteA.id)

    const vista = (await listarComo('contador'))!.lista.find(
      (item) => item.id === id,
    )
    expect(vista?.anexos).toHaveLength(1)
    expect(vista?.anexos[0].url).toBe(
      `/api/oportunidades/${id}/arquivos/${arquivoId}`,
    )
    // A chave do armazenamento privado não sai do servidor: a tela só conhece
    // a rota autorizada.
    expect(JSON.stringify(vista?.anexos)).not.toContain(chave)
  })
})

describe('proposta do prestador', () => {
  const PROPOSTA = {
    mensagem:
      'Cuido da abertura e do primeiro ano de obrigações fiscais da sua empresa.',
    valor: '850,00',
    prazoEstimadoDias: 10,
  }

  it('prestador compatível envia proposta', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    const resultado = await enviarProposta({ ...PROPOSTA, oportunidadeId: id })
    expect(resultado.sucesso).toBe(true)

    const [proposta] = await db
      .select()
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(proposta.prestadorId).toBe(contas.contador.id)
    expect(proposta.valorCentavos).toBe(85000)
    expect(proposta.prazoEstimadoDias).toBe(10)
    expect(proposta.status).toBe('enviada')
  })

  it('sem valor a proposta continua válida e nada é inventado', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id, valor: '' })

    const [proposta] = await db
      .select()
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(proposta.valorCentavos).toBeNull()
  })

  it('reenviar revisa a mesma proposta, não cria outra', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id, valor: '900,00' })

    const linhas = await db
      .select()
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].valorCentavos).toBe(90000)
  })

  it('não existe limite de quantas propostas uma oportunidade recebe', async () => {
    // Nenhum teto foi inventado enquanto a regra de produto não é definida.
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })
    entrarComo(contas.colabFiscal.token)
    const segunda = await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    expect(segunda.sucesso).toBe(true)
    const [registro] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    // E receber propostas não encerra a solicitação sozinho.
    expect(registro.status).toBe('aberta')
  })

  it('categoria incompatível, prestador não habilitado e Cliente são recusados', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.advogado.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)

    entrarComo(contas.contadorPendente.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)

    entrarComo(contas.clienteB.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)

    sairDaSessao()
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)

    const linhas = await db
      .select()
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, id))
    expect(linhas).toHaveLength(0)
  })

  it('oportunidade encerrada não recebe proposta', async () => {
    const id = await solicitarComo('clienteA')
    await db
      .update(oportunidades)
      .set({ status: 'encerrada' })
      .where(eq(oportunidades.id, id))

    entrarComo(contas.contador.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: id })).sucesso,
    ).toBe(false)
  })

  it('responder desconta a oportunidade do destaque do Dashboard', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    const depois = await listarComo('contador')
    expect(depois?.disponiveis).toBe(0)
    // A oportunidade continua na lista, agora marcada como respondida.
    expect(depois?.lista[0].minhaProposta?.valorCentavos).toBe(85000)
  })
})

describe('privacidade das propostas', () => {
  const PROPOSTA = {
    mensagem:
      'Cuido da abertura e do primeiro ano de obrigações fiscais da sua empresa.',
    valor: '850,00',
    prazoEstimadoDias: 10,
  }

  it('um prestador nunca vê a proposta de outro', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    const [doContador] = await db
      .select({ id: oportunidadePropostas.id })
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, id))

    const doColaborador = await listarComo('colabFiscal')
    const vista = doColaborador!.lista.find((item) => item.id === id)
    expect(vista).toBeDefined()
    // A proposta do contador existe, mas não chega até aqui — nem o registro,
    // nem o id dele em campo nenhum do payload.
    expect(vista!.minhaProposta).toBeNull()
    expect(JSON.stringify(doColaborador)).not.toContain(doContador.id)
  })

  it('só o Cliente dono compara as propostas recebidas', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })
    entrarComo(contas.colabFiscal.token)
    await enviarProposta({
      ...PROPOSTA,
      oportunidadeId: id,
      valor: '600,00',
      mensagem: 'Faço o acompanhamento fiscal mensal da sua empresa.',
    })

    entrarComo(contas.clienteA.token)
    const minhas = await carregarMinhasOportunidades()
    const oportunidade = minhas.dados?.find((item) => item.id === id)
    expect(oportunidade?.totalPropostas).toBe(2)
    expect(
      oportunidade?.propostas.map((proposta) => proposta.valorCentavos).sort(),
    ).toEqual([60000, 85000])

    // O outro Cliente não alcança a solicitação alheia.
    entrarComo(contas.clienteB.token)
    const doOutro = await carregarMinhasOportunidades()
    expect(doOutro.dados).toHaveLength(0)
  })
})

describe('banner do Dashboard e "não tenho interesse"', () => {
  const PROPOSTA = {
    mensagem:
      'Cuido da abertura e do primeiro ano de obrigações fiscais da sua empresa.',
    valor: '850,00',
    prazoEstimadoDias: 10,
  }

  it('sem oportunidade pendente o contador do banner é zero', async () => {
    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(0)
  })

  it('o contador do banner reflete o número real, singular e plural', async () => {
    await solicitarComo('clienteA')
    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(1)

    await solicitarComo('clienteA')
    await solicitarComo('clienteB')
    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(3)
  })

  it('enviar proposta zera a pendência de quem enviou, e só dele', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(0)
    // O colega continua com a mesma oportunidade esperando resposta.
    expect(await contarOportunidadesDisponiveis(contas.colabFiscal.id)).toBe(1)
  })

  it('"não tenho interesse" tira da fila só de quem dispensou', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.contador.token)
    const resultado = await marcarSemInteresse({ oportunidadeId: id })
    expect(resultado.sucesso).toBe(true)

    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(0)
    expect(await contarOportunidadesDisponiveis(contas.colabFiscal.id)).toBe(1)
    expect(
      await contarOportunidadesDisponiveis(contas.especialistaFiscal.id),
    ).toBe(1)

    // E a solicitação do Cliente continua aberta: dispensar não é cancelar.
    const [registro] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, id))
    expect(registro.status).toBe('aberta')
  })

  it('a dispensa persiste: a oportunidade não volta como nova', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })
    // Segunda chamada não duplica linha nem falha (índice único + onConflict).
    expect((await marcarSemInteresse({ oportunidadeId: id })).sucesso).toBe(true)

    const linhas = await db
      .select()
      .from(oportunidadeDispensas)
      .where(eq(oportunidadeDispensas.oportunidadeId, id))
    expect(linhas).toHaveLength(1)

    // Recarregar a tela não ressuscita a pendência.
    const depois = await listarComo('contador')
    expect(depois?.disponiveis).toBe(0)
    const vista = depois?.lista.find((item) => item.id === id)
    // Continua visível, marcada — não some sem explicação.
    expect(vista?.dispensada).toBe(true)
  })

  it('enviar proposta depois de dispensar desfaz a dispensa', async () => {
    const id = await solicitarComo('clienteA')
    entrarComo(contas.contador.token)
    await marcarSemInteresse({ oportunidadeId: id })
    await enviarProposta({ ...PROPOSTA, oportunidadeId: id })

    const depois = await listarComo('contador')
    const vista = depois?.lista.find((item) => item.id === id)
    expect(vista?.dispensada).toBe(false)
    expect(vista?.minhaProposta).not.toBeNull()
  })

  it('sem pendências restantes o banner volta ao estado da meta', async () => {
    const primeira = await solicitarComo('clienteA')
    const segunda = await solicitarComo('clienteB')

    entrarComo(contas.contador.token)
    await enviarProposta({ ...PROPOSTA, oportunidadeId: primeira })
    await marcarSemInteresse({ oportunidadeId: segunda })

    expect(await contarOportunidadesDisponiveis(contas.contador.id)).toBe(0)
  })

  it('quem não poderia responder também não dispensa', async () => {
    const id = await solicitarComo('clienteA')

    entrarComo(contas.advogado.token)
    expect((await marcarSemInteresse({ oportunidadeId: id })).sucesso).toBe(false)
    entrarComo(contas.contadorPendente.token)
    expect((await marcarSemInteresse({ oportunidadeId: id })).sucesso).toBe(false)
    entrarComo(contas.clienteA.token)
    expect((await marcarSemInteresse({ oportunidadeId: id })).sucesso).toBe(false)
    sairDaSessao()
    expect((await marcarSemInteresse({ oportunidadeId: id })).sucesso).toBe(false)

    expect(await db.select().from(oportunidadeDispensas)).toHaveLength(0)
  })
})

/**
 * Guarda de regressão do formulário público.
 *
 * A suíte roda em Node, sem DOM, então o comportamento visual é validado no
 * navegador. O que dá para garantir aqui — e é justamente o que já regrediu uma
 * vez — é a **forma**: o formulário vive num collapsible dentro da página, tem
 * ação de recolher, e não voltou a ser um diálogo.
 */
describe('forma do formulário público', () => {
  const chamada = readFileSync(
    'src/features/oportunidades/components/cliente/ChamadaSolicitarOrcamento.tsx',
    'utf8',
  )
  const formulario = readFileSync(
    'src/features/oportunidades/components/cliente/FormularioSolicitarOrcamento.tsx',
    'utf8',
  )

  it('usa collapsible, e não modal', () => {
    expect(chamada).toContain('CollapsibleTrigger')
    expect(chamada).toContain('CollapsibleContent')
    expect(chamada).not.toContain('Dialog')
    expect(formulario).not.toContain('Dialog')
  })

  it('oferece ação visível de recolher em dois pontos', () => {
    // O próprio gatilho vira "Recolher" quando aberto...
    expect(chamada).toContain('Recolher')
    // ...e o rodapé do formulário tem "Fechar", para quem chegou ao fim.
    expect(formulario).toContain('Fechar')
  })

  it('mostra o contador de caracteres da descrição', () => {
    expect(formulario).toContain('LIMITE_DESCRICAO_OPORTUNIDADE')
    expect(formulario).toContain('descricao.length')
  })
})
