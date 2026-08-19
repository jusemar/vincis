import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoParticipantes,
  atendimentos,
  clientes,
  contratacoesServico,
  perfis,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
// O armazenamento privado não é exercitado pela suíte: o teste é de regra e
// de banco. A validação de tipo/tamanho continua real (não é mockada).
vi.mock('@/features/atendimentos/lib/arquivo-atendimento', async (original) => {
  const real = await original<
    typeof import('@/features/atendimentos/lib/arquivo-atendimento')
  >()
  return {
    ...real,
    enviarArquivoAtendimento: async (atendimentoId: string, arquivo: File) => {
      real.validarArquivoAtendimento(arquivo)
      return {
        chave: `atendimentos/${atendimentoId}/arquivos/teste.txt`,
        nome: arquivo.name,
        tipoMime: arquivo.type,
        tamanhoBytes: arquivo.size,
      }
    },
  }
})

import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { anexarArquivoNoAtendimento } from '@/features/atendimentos/lib/anexar-arquivo'
import { alterarStatusDoAtendimento } from '@/features/atendimentos/lib/alterar-status'
import { concluirAtendimento } from '@/features/atendimentos/lib/concluir-atendimento'
import {
  adicionarItemDoChecklist,
  alternarItemDoChecklist,
  listarChecklistDoAtendimento,
  removerItemDoChecklist,
  reordenarChecklist,
} from '@/features/atendimentos/lib/checklist'
import { calcularProgresso } from '@/features/atendimentos/lib/progresso-checklist'
import { solicitarAoCliente } from '@/features/atendimentos/lib/solicitar-ao-cliente'
import {
  definirPrazoDoAtendimento,
  definirPrioridadeDoAtendimento,
  interpretarPrazo,
} from '@/features/atendimentos/lib/ajustes-operacionais'
import { enviarMensagemNoAtendimento } from '@/features/atendimentos/lib/mensagens'
import { publicarManifestacaoNoAtendimento } from '@/features/atendimentos/lib/manifestacoes'
import { obterArquivoDoAtendimento } from '@/features/atendimentos/queries/obter-arquivo-do-atendimento'
import {
  podeTransicionar,
  transicoesPermitidas,
} from '@/features/atendimentos/lib/transicoes'
import { rotuloCategoria } from '@/features/atendimentos/constants/atendimento'
import { mapearAtendimentoParaCard } from '@/features/admin/lib/atendimentos-reais'
import { garantirAtendimentoDaContratacao } from '@/features/atendimentos/lib/criar-atendimento-da-contratacao'
import { obterAcessoAtendimento } from '@/features/atendimentos/lib/autorizacao'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { limparAtendimentosDosPrestadores } from './setup/limpeza-atendimentos'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@atendimentos.teste'
type Chave = 'prestador' | 'outroPrestador' | 'cliente' | 'outroCliente'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  prestador: { perfil: 'profissional', prestador: 'profissional' },
  outroPrestador: { perfil: 'profissional', prestador: 'profissional' },
  cliente: { perfil: 'cliente' },
  outroCliente: { perfil: 'cliente' },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

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
        nome: `Atendimento ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193200${String(i).padStart(4, '0')}`,
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
        apresentacao: 'Conta de teste de atendimentos.',
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
      userAgent: 'atendimentos-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

const BASE = {
  nome: 'Abertura de Empresa',
  descricaoCurta: 'Abertura completa de MEI.',
  descricaoDetalhada: 'Inclui CNPJ e alvará.',
  categoria: 'contabil' as const,
  itensIncluidos: ['CNPJ'],
  checklistModelo: [] as string[],
  modeloPreco: 'fixo' as const,
  valor: '100,00',
  prazoEstimadoDias: 5,
  ativo: true,
  publico: true,
  ordem: 0,
}

async function criarServicoDoPrestador(dados: Partial<typeof BASE> = {}) {
  entrarComo(contas.prestador.token)
  const resultado = await criarServico({ ...BASE, ...dados })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { id: string } }).dados.id
}

async function contratarComo(chave: Chave, servicoId: string) {
  entrarComo(contas[chave].token)
  const resultado = await contratarServico({ servicoId })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return resultado.dados as {
    contratacaoId: string
    jaExistia: boolean
    atendimentoId: string
    protocolo: string
  }
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('contratação gera Atendimento', () => {
  it('nasce em "novo" com o prestador como responsável', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { contratacaoId, atendimentoId } = await contratarComo('cliente', servicoId)

    const [atendimento] = await db
      .select()
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))

    expect(atendimento.status).toBe('novo')
    expect(atendimento.contratacaoId).toBe(contratacaoId)
    expect(atendimento.prestadorId).toBe(contas.prestador.id)
    expect(atendimento.responsavelId).toBe(contas.prestador.id)
    expect(atendimento.clienteUsuarioId).toBe(contas.cliente.id)
    expect(atendimento.titulo).toBe('Abertura de Empresa')
    // Prazo de 5 dias no catálogo vira data real no Atendimento.
    expect(atendimento.prazoEm).not.toBeNull()

    const participantes = await db
      .select()
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimentoId))
    expect(participantes).toHaveLength(1)
    expect(participantes[0].usuarioId).toBe(contas.prestador.id)
    expect(participantes[0].papel).toBe('responsavel')
  })

  it('registra os eventos verdadeiros no histórico', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const eventos = await db
      .select({ tipo: atendimentoEventos.tipo })
      .from(atendimentoEventos)
      .where(eq(atendimentoEventos.atendimentoId, atendimentoId))

    expect(eventos.map((e) => e.tipo).sort()).toEqual([
      'atendimento_criado',
      'responsavel_definido',
      'servico_contratado',
    ])
  })

  it('contratação sem prazo no catálogo não inventa prazo', async () => {
    const servicoId = await criarServicoDoPrestador({
      nome: 'Consulta avulsa',
      prazoEstimadoDias: undefined,
    })
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    const [atendimento] = await db
      .select({ prazoEm: atendimentos.prazoEm })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(atendimento.prazoEm).toBeNull()
  })
})

describe('protocolo', () => {
  it('usa o formato #AAAA-NNNN com o ano da criação', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { protocolo } = await contratarComo('cliente', servicoId)
    expect(protocolo).toMatch(/^#\d{4}-\d{4}$/)
    expect(protocolo.slice(1, 5)).toBe(String(new Date().getFullYear()))
  })

  it('dois Atendimentos recebem protocolos diferentes', async () => {
    const primeiro = await criarServicoDoPrestador()
    const segundo = await criarServicoDoPrestador({ nome: 'Outro serviço' })
    const a = await contratarComo('cliente', primeiro)
    const b = await contratarComo('outroCliente', segundo)
    expect(a.protocolo).not.toBe(b.protocolo)
  })

  it('é imutável: o banco recusa alterar o protocolo', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId, protocolo } = await contratarComo('cliente', servicoId)

    await expect(
      db.execute(
        sql`update atendimentos set protocolo = '#1999-0001' where id = ${atendimentoId}`,
      ),
    ).rejects.toThrow()

    const [atual] = await db
      .select({ protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(atual.protocolo).toBe(protocolo)
  })

  it('duas criações simultâneas não duplicam o Atendimento nem o protocolo', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { contratacaoId } = await contratarComo('cliente', servicoId)

    // Reprocessa a mesma contratação em paralelo: só pode existir um.
    const resultados = await Promise.all([
      garantirAtendimentoDaContratacao(db, contratacaoId),
      garantirAtendimentoDaContratacao(db, contratacaoId),
      garantirAtendimentoDaContratacao(db, contratacaoId),
    ])
    expect(new Set(resultados.map((r) => r.id)).size).toBe(1)

    const linhas = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.contratacaoId, contratacaoId))
    expect(linhas).toHaveLength(1)
  })

  it('contratar duas vezes o mesmo serviço não abre um segundo Atendimento', async () => {
    const servicoId = await criarServicoDoPrestador()
    const primeira = await contratarComo('cliente', servicoId)
    const segunda = await contratarComo('cliente', servicoId)

    expect(segunda.jaExistia).toBe(true)
    expect(segunda.atendimentoId).toBe(primeira.atendimentoId)
    expect(segunda.protocolo).toBe(primeira.protocolo)
  })
})

describe('isolamento', () => {
  it('o prestador responsável enxerga o Atendimento', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const lista = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(lista.map((a) => a.id)).toContain(atendimentoId)
    expect(lista[0].cliente.nome).toBe('Atendimento cliente')
  })

  it('prestador sem relação não enxerga nada', async () => {
    const servicoId = await criarServicoDoPrestador()
    await contratarComo('cliente', servicoId)

    const lista = await listarAtendimentosDoPrestador(contas.outroPrestador.id)
    expect(lista).toHaveLength(0)
  })

  it('prestador sem relação não obtém acesso nem sabendo o id', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    expect(
      await obterAcessoAtendimento(atendimentoId, contas.outroPrestador.id),
    ).toBeNull()
    expect(
      await obterAcessoAtendimento(atendimentoId, contas.outroCliente.id),
    ).toBeNull()
  })

  it('o Cliente proprietário tem acesso, com vínculo de cliente', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const acesso = await obterAcessoAtendimento(atendimentoId, contas.cliente.id)
    expect(acesso?.vinculo).toBe('cliente')
  })

  it('participante convidado passa a enxergar o Atendimento', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      papel: 'convidado',
    })

    const acesso = await obterAcessoAtendimento(
      atendimentoId,
      contas.outroPrestador.id,
    )
    expect(acesso?.vinculo).toBe('participante')

    const lista = await listarAtendimentosDoPrestador(contas.outroPrestador.id)
    expect(lista.map((a) => a.id)).toContain(atendimentoId)
    expect(lista[0].participantes).toHaveLength(2)
  })
})

describe('fluxo de status', () => {
  async function atendimentoNovo() {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    return atendimentoId
  }

  it('a máquina de estados descreve o fluxo pedido', () => {
    expect(transicoesPermitidas('novo').map((a) => a.destino)).toEqual([
      'em_andamento',
      'recusado',
    ])
    expect(transicoesPermitidas('em_andamento').map((a) => a.destino)).toEqual([
      'aguardando_cliente',
      'aguardando_assinatura',
      'concluido',
      'cancelado',
    ])
    // Aguardando cliente e assinatura voltam a andar; assinatura também conclui.
    expect(podeTransicionar('aguardando_cliente', 'em_andamento')).toBe(true)
    expect(podeTransicionar('aguardando_assinatura', 'em_andamento')).toBe(true)
    expect(podeTransicionar('aguardando_assinatura', 'concluido')).toBe(true)
  })

  it('estados terminais não voltam para trás', () => {
    for (const terminal of ['concluido', 'recusado', 'cancelado'] as const) {
      expect(transicoesPermitidas(terminal)).toHaveLength(0)
      expect(podeTransicionar(terminal, 'em_andamento')).toBe(false)
      expect(podeTransicionar(terminal, 'novo')).toBe(false)
    }
  })

  it('Iniciar leva de Novo para Em andamento e grava o histórico', async () => {
    const atendimentoId = await atendimentoNovo()

    const resultado = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })
    expect(resultado).toMatchObject({ sucesso: true, de: 'novo', para: 'em_andamento' })

    const [atual] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(atual.status).toBe('em_andamento')

    const [evento] = await db
      .select({
        descricao: atendimentoEventos.descricao,
        metadados: atendimentoEventos.metadados,
      })
      .from(atendimentoEventos)
      .where(
        and(
          eq(atendimentoEventos.atendimentoId, atendimentoId),
          eq(atendimentoEventos.tipo, 'status_alterado'),
        ),
      )
    expect(evento.descricao).toBe(
      'Atendimento prestador alterou de Novo para Em andamento.',
    )
    expect(evento.metadados).toMatchObject({ de: 'novo', para: 'em_andamento' })
  })

  it('transição inválida é recusada no servidor', async () => {
    const atendimentoId = await atendimentoNovo()

    const pulo = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'concluido',
    })
    expect(pulo).toEqual({ sucesso: false, motivo: 'transicao-invalida' })

    const [atual] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(atual.status).toBe('novo')
  })

  it('recusado é terminal também na prática', async () => {
    const atendimentoId = await atendimentoNovo()
    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'recusado',
    })
    const volta = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })
    expect(volta).toEqual({ sucesso: false, motivo: 'transicao-invalida' })
  })

  it('nem o Cliente nem um estranho movem o Atendimento', async () => {
    const atendimentoId = await atendimentoNovo()
    for (const usuarioId of [contas.cliente.id, contas.outroPrestador.id]) {
      expect(
        await alterarStatusDoAtendimento({
          atendimentoId,
          usuarioId,
          destino: 'em_andamento',
        }),
      ).toEqual({ sucesso: false, motivo: 'sem-acesso' })
    }
  })

  it('o protocolo não muda quando o status muda', async () => {
    const atendimentoId = await atendimentoNovo()
    const [antes] = await db
      .select({ protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))

    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })
    // Concluir tem caminho próprio — é entrega, não troca de status. O que este
    // teste mede continua sendo o mesmo: o protocolo atravessa o fluxo inteiro
    // sem mudar.
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
    })

    const [depois] = await db
      .select({ protocolo: atendimentos.protocolo, status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(depois.protocolo).toBe(antes.protocolo)
    expect(depois.status).toBe('concluido')
  })

  it('a lista do prestador oferece só as transições válidas do status atual', async () => {
    const atendimentoId = await atendimentoNovo()
    const novo = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(novo[0].acoes.map((a) => a.rotulo)).toEqual(['Iniciar', 'Recusar'])

    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })
    const emAndamento = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(emAndamento[0].acoes.map((a) => a.destino)).toContain('aguardando_cliente')
    expect(emAndamento[0].acoes.map((a) => a.destino)).not.toContain('recusado')
  })
})

describe('categoria', () => {
  it('Consultoria continua Consultoria, sem virar outra categoria', async () => {
    const servicoId = await criarServicoDoPrestador({
      nome: 'Consultoria tributária',
      categoria: 'consultoria',
    })
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const [atendimento] = await db
      .select({ categoria: atendimentos.categoria })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))

    expect(atendimento.categoria).toBe('consultoria')
    expect(rotuloCategoria('consultoria')).toBe('Consultoria')
    expect(rotuloCategoria('contabil')).toBe('Contábil')
    // Categoria futura desconhecida não é traduzida para uma vizinha.
    expect(rotuloCategoria('ambiental')).toBe('Ambiental')
  })
})

describe('conversa', () => {
  async function cenario() {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    return atendimentoId
  }

  it('Cliente escreve e o prestador recebe', async () => {
    const atendimentoId = await cenario()
    const envio = await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      escopo: 'cliente',
      conteudo: 'Olá, preciso de orientação sobre os documentos.',
    })
    expect(envio.sucesso).toBe(true)

    const [visao] = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(visao.mensagens).toHaveLength(1)
    expect(visao.mensagens[0].conteudo).toBe(
      'Olá, preciso de orientação sobre os documentos.',
    )
    expect(visao.mensagens[0].autorEhCliente).toBe(true)
  })

  it('prestador responde e o Cliente recebe', async () => {
    const atendimentoId = await cenario()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      escopo: 'cliente',
      conteudo: 'Vou verificar e te oriento por aqui.',
    })

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visaoCliente.mensagens.map((m) => m.conteudo)).toEqual([
      'Vou verificar e te oriento por aqui.',
    ])
    expect(visaoCliente.mensagens[0].autorEhCliente).toBe(false)
  })

  it('nota interna nunca chega ao Cliente', async () => {
    const atendimentoId = await cenario()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      escopo: 'interno',
      conteudo: 'Conferir documentação antes de responder.',
    })

    const [visaoPrestador] = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(visaoPrestador.mensagens.some((m) => m.escopo === 'interno')).toBe(true)

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visaoCliente.mensagens).toHaveLength(0)
    // Nem o texto atravessa: a consulta do Cliente não lê o canal interno.
    expect(JSON.stringify(visaoCliente)).not.toContain('Conferir documentação')
  })

  it('o Cliente não consegue escrever no canal interno', async () => {
    const atendimentoId = await cenario()
    const tentativa = await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      escopo: 'interno',
      conteudo: 'tentando entrar no canal da equipe',
    })
    expect(tentativa).toEqual({ sucesso: false, motivo: 'escopo-proibido' })
  })

  it('estranho não escreve na conversa', async () => {
    const atendimentoId = await cenario()
    expect(
      await enviarMensagemNoAtendimento({
        atendimentoId,
        usuarioId: contas.outroPrestador.id,
        escopo: 'cliente',
        conteudo: 'oi',
      }),
    ).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })

  it('a mensagem da contratação não entra na Conversa: ela abre o Protocolo', async () => {
    const servicoId = await criarServicoDoPrestador()
    entrarComo(contas.cliente.token)
    const resultado = await contratarServico({
      servicoId,
      mensagem: 'Preciso abrir um MEI e já tenho meus documentos.',
    })
    expect(resultado.sucesso).toBe(true)

    const [visao] = await listarAtendimentosDoPrestador(contas.prestador.id)
    // A Conversa começa vazia — o texto está no Protocolo, e só lá.
    expect(visao.mensagens).toHaveLength(0)
    expect(visao.manifestacoes).toHaveLength(1)
  })

  it('contratar sem mensagem não inventa conversa', async () => {
    const servicoId = await criarServicoDoPrestador()
    await contratarComo('cliente', servicoId)
    const [visao] = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(visao.mensagens).toHaveLength(0)
  })
})

describe('Protocolo', () => {
  /**
   * Cenário base: Cliente contrata escrevendo a solicitação e um segundo
   * profissional é convidado para o mesmo Atendimento. É a configuração em que
   * a visibilidade assimétrica pode ser observada de verdade — com um
   * participante só, não há de quem esconder nada.
   */
  async function cenarioComDoisParticipantes(
    mensagem = 'Preciso abrir um MEI e já tenho meus documentos.',
  ) {
    const servicoId = await criarServicoDoPrestador()
    entrarComo(contas.cliente.token)
    const resultado = await contratarServico({ servicoId, mensagem })
    if (!resultado.sucesso) throw new Error(resultado.mensagem)
    const { atendimentoId } = resultado.dados as { atendimentoId: string }

    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      papel: 'convidado',
    })

    return atendimentoId
  }

  async function protocoloDoPrestador(usuarioId: string, atendimentoId: string) {
    const lista = await listarAtendimentosDoPrestador(usuarioId)
    const alvo = lista.find((a) => a.id === atendimentoId)
    if (!alvo) throw new Error('Atendimento não visível para esta conta.')
    return alvo
  }

  it('a mensagem da contratação vira a primeira manifestação do Cliente', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)

    expect(visao.manifestacoes).toHaveLength(1)
    expect(visao.manifestacoes[0].conteudo).toBe(
      'Preciso abrir um MEI e já tenho meus documentos.',
    )
    expect(visao.manifestacoes[0].papelAutor).toBe('cliente')
  })

  it('a mensagem inicial não é duplicada na Conversa', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)
    expect(visao.mensagens).toHaveLength(0)

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visaoCliente.mensagens).toHaveLength(0)
    expect(visaoCliente.manifestacoes).toHaveLength(1)
  })

  it('contratar sem mensagem não abre Protocolo nem Conversa', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)
    expect(visao.manifestacoes).toHaveLength(0)
    expect(visao.mensagens).toHaveLength(0)
  })

  it('o Cliente registra nova manifestação no mesmo Atendimento', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const envio = await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Surgiu outra dúvida: preciso de alvará também?',
    })
    expect(envio).toMatchObject({ sucesso: true, papelAutor: 'cliente' })

    // Continua sendo o mesmo Atendimento: nenhum protocolo novo foi aberto.
    const lista = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(lista).toHaveLength(1)
    expect(lista[0].manifestacoes).toHaveLength(2)
  })

  it('cada participante enxerga a manifestação do Cliente e só a própria resposta', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()

    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta do responsável sobre a documentação.',
    })
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      conteudo: 'Resposta do convidado sobre a parte jurídica.',
    })

    const visaoResponsavel = await protocoloDoPrestador(
      contas.prestador.id,
      atendimentoId,
    )
    expect(visaoResponsavel.manifestacoes).toHaveLength(2)
    expect(
      visaoResponsavel.manifestacoes.map((m) => m.conteudo).join(' '),
    ).toContain('Resposta do responsável')
    // A resposta do outro não chega nem como texto solto no DTO.
    expect(JSON.stringify(visaoResponsavel)).not.toContain(
      'Resposta do convidado',
    )

    const visaoConvidado = await protocoloDoPrestador(
      contas.outroPrestador.id,
      atendimentoId,
    )
    expect(visaoConvidado.manifestacoes).toHaveLength(2)
    expect(JSON.stringify(visaoConvidado)).not.toContain(
      'Resposta do responsável',
    )
  })

  it('o Cliente enxerga todas as manifestações e todas as respostas', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta do responsável sobre a documentação.',
    })
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      conteudo: 'Resposta do convidado sobre a parte jurídica.',
    })

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visaoCliente.manifestacoes).toHaveLength(3)
    expect(visaoCliente.manifestacoes.map((m) => m.papelAutor)).toEqual([
      'cliente',
      'participante',
      'participante',
    ])
  })

  it('Protocolo e Conversa não compartilham dado nenhum', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      escopo: 'cliente',
      conteudo: 'Recado rápido pelo chat.',
    })
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta formal no protocolo.',
    })

    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)
    expect(visao.mensagens.map((m) => m.conteudo)).toEqual([
      'Recado rápido pelo chat.',
    ])
    expect(visao.manifestacoes.map((m) => m.conteudo)).not.toContain(
      'Recado rápido pelo chat.',
    )
    expect(visao.mensagens.map((m) => m.conteudo)).not.toContain(
      'Resposta formal no protocolo.',
    )
  })

  it('a nota interna continua fora do alcance do Cliente', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      escopo: 'interno',
      conteudo: 'Nota interna: conferir CNAE antes de responder.',
    })

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(JSON.stringify(visaoCliente)).not.toContain('conferir CNAE')
  })

  it('quem não tem vínculo não publica no Protocolo', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    // `outroCliente` não é dono nem participante deste Atendimento.
    expect(
      await publicarManifestacaoNoAtendimento({
        atendimentoId,
        usuarioId: contas.outroCliente.id,
        conteudo: 'tentando entrar no protocolo alheio',
      }),
    ).toEqual({ sucesso: false, motivo: 'sem-acesso' })

    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)
    expect(JSON.stringify(visao)).not.toContain('protocolo alheio')
  })

  it('responder a uma manifestação que não se pode ler é recusado', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const resposta = await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta do responsável.',
    })
    if (!resposta.sucesso) throw new Error('resposta não gravada')

    // O convidado não enxerga a resposta do responsável; usar o id dela como
    // referência é recusado no servidor, e não escondido só na tela.
    expect(
      await publicarManifestacaoNoAtendimento({
        atendimentoId,
        usuarioId: contas.outroPrestador.id,
        conteudo: 'respondendo àquilo que eu não deveria ver',
        respondeManifestacaoId: resposta.id,
      }),
    ).toEqual({ sucesso: false, motivo: 'referencia-invalida' })
  })

  it('a resposta do Cliente pode referenciar qualquer linha do próprio protocolo', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const resposta = await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta do responsável.',
    })
    if (!resposta.sucesso) throw new Error('resposta não gravada')

    const replica = await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Entendi, obrigado. Já envio os documentos.',
      respondeManifestacaoId: resposta.id,
    })
    expect(replica.sucesso).toBe(true)

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    const ultima = visaoCliente.manifestacoes.at(-1)
    expect(ultima?.respondeManifestacaoId).toBe(resposta.id)
  })

  it('o histórico registra o Protocolo sem revelar conteúdo nem autor da resposta', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Nova dúvida sobre o alvará.',
    })
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta secreta do responsável.',
    })

    const eventos = await db
      .select({
        tipo: atendimentoEventos.tipo,
        descricao: atendimentoEventos.descricao,
      })
      .from(atendimentoEventos)
      .where(eq(atendimentoEventos.atendimentoId, atendimentoId))

    const tipos = eventos.map((e) => e.tipo)
    expect(tipos).toContain('protocolo_aberto')
    expect(tipos).toContain('manifestacao_cliente')
    expect(tipos).toContain('resposta_protocolo')
    // Resumo, nunca o conteúdo.
    expect(eventos.map((e) => e.descricao).join(' ')).not.toContain(
      'Resposta secreta',
    )
  })

  it('o arquivo citado precisa ser do mesmo Atendimento', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    const arquivo = await anexarArquivoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      arquivo: new File(['conteúdo real'], 'documentos.txt', {
        type: 'text/plain',
      }),
    })

    const outro = await cenarioComDoisParticipantes('Outro caso.')
    expect(
      await publicarManifestacaoNoAtendimento({
        atendimentoId: outro,
        usuarioId: contas.cliente.id,
        conteudo: 'citando arquivo de outro atendimento',
        arquivoId: arquivo.id,
      }),
    ).toEqual({ sucesso: false, motivo: 'arquivo-invalido' })

    // No Atendimento certo, a citação é aceita e o arquivo continua na aba
    // Arquivos — o Protocolo cita, não guarda.
    const citacao = await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Seguem os documentos citados.',
      arquivoId: arquivo.id,
    })
    expect(citacao.sucesso).toBe(true)

    const visao = await protocoloDoPrestador(contas.prestador.id, atendimentoId)
    expect(visao.arquivos.map((a) => a.id)).toContain(arquivo.id)
    expect(visao.manifestacoes.at(-1)?.arquivo?.nome).toBe('documentos.txt')
  })

  it('manifestação de um Atendimento não aparece em outro', async () => {
    const primeiro = await cenarioComDoisParticipantes('Primeiro caso.')
    const segundo = await cenarioComDoisParticipantes('Segundo caso.')

    const lista = await listarAtendimentosDoPrestador(contas.prestador.id)
    const visaoPrimeiro = lista.find((a) => a.id === primeiro)
    const visaoSegundo = lista.find((a) => a.id === segundo)

    expect(visaoPrimeiro?.manifestacoes.map((m) => m.conteudo)).toEqual([
      'Primeiro caso.',
    ])
    expect(visaoSegundo?.manifestacoes.map((m) => m.conteudo)).toEqual([
      'Segundo caso.',
    ])
  })

  it('a manifestação persiste no banco com papel e visibilidade próprios', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Resposta persistida.',
    })

    const linhas = await db
      .select({
        papelAutor: atendimentoManifestacoes.papelAutor,
        visibilidade: atendimentoManifestacoes.visibilidade,
        conteudo: atendimentoManifestacoes.conteudo,
      })
      .from(atendimentoManifestacoes)
      .where(eq(atendimentoManifestacoes.atendimentoId, atendimentoId))

    expect(linhas).toHaveLength(2)
    expect(linhas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          papelAutor: 'cliente',
          visibilidade: 'participantes_e_cliente',
        }),
        expect.objectContaining({
          papelAutor: 'participante',
          visibilidade: 'autor_e_cliente',
          conteudo: 'Resposta persistida.',
        }),
      ]),
    )
  })

  it('publicar no Protocolo não mexe no status do Atendimento', async () => {
    const atendimentoId = await cenarioComDoisParticipantes()
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Mais uma dúvida.',
    })

    const [registro] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(registro.status).toBe('novo')
  })
})

describe('arquivos', () => {
  function arquivoDeTeste(nome = 'documento-de-teste.txt') {
    return new File(['Documento de teste Vincis\nValidação de anexos\n'], nome, {
      type: 'text/plain',
    })
  }

  it('Cliente anexa durante o atendimento e o prestador vê', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const anexado = await anexarArquivoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      arquivo: arquivoDeTeste(),
    })
    expect(anexado.origem).toBe('cliente')

    const [visao] = await listarAtendimentosDoPrestador(contas.prestador.id)
    expect(visao.arquivos.map((a) => a.nome)).toEqual(['documento-de-teste.txt'])
    expect(visao.eventos.some((e) => e.tipo === 'arquivo_anexado')).toBe(true)
  })

  it('prestador anexa e o arquivo fica com origem de prestador', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const anexado = await anexarArquivoNoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      arquivo: arquivoDeTeste('parecer.txt'),
    })
    expect(anexado.origem).toBe('prestador')

    const [visaoCliente] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visaoCliente.arquivos.map((a) => a.nome)).toEqual(['parecer.txt'])
  })

  it('estranho não anexa', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    await expect(
      anexarArquivoNoAtendimento({
        atendimentoId,
        usuarioId: contas.outroPrestador.id,
        arquivo: arquivoDeTeste(),
      }),
    ).rejects.toThrow(/autoriza/i)
  })

  it('o download confere pessoa e vínculo do arquivo', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    const anexado = await anexarArquivoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      arquivo: arquivoDeTeste(),
    })

    // Outro atendimento, do mesmo prestador, para tentar cruzar os ids.
    const outroServico = await criarServicoDoPrestador({ nome: 'Outro serviço' })
    const outro = await contratarComo('outroCliente', outroServico)

    expect(
      await obterArquivoDoAtendimento({
        atendimentoId,
        arquivoId: anexado.id,
        usuarioId: contas.cliente.id,
      }),
    ).not.toBeNull()

    // Pessoa sem vínculo.
    expect(
      await obterArquivoDoAtendimento({
        atendimentoId,
        arquivoId: anexado.id,
        usuarioId: contas.outroCliente.id,
      }),
    ).toBeNull()

    // Id de arquivo de um atendimento, pedido por outro atendimento legítimo.
    expect(
      await obterArquivoDoAtendimento({
        atendimentoId: outro.atendimentoId,
        arquivoId: anexado.id,
        usuarioId: contas.outroCliente.id,
      }),
    ).toBeNull()
  })
})

describe('área do Cliente', () => {
  it('cada Cliente enxerga apenas os próprios atendimentos', async () => {
    const servicoA = await criarServicoDoPrestador()
    const servicoB = await criarServicoDoPrestador({ nome: 'Serviço do outro' })
    const meu = await contratarComo('cliente', servicoA)
    await contratarComo('outroCliente', servicoB)

    const meus = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(meus.map((a) => a.id)).toEqual([meu.atendimentoId])

    const doOutro = await listarAtendimentosDoCliente(contas.outroCliente.id)
    expect(doOutro.map((a) => a.id)).not.toContain(meu.atendimentoId)
  })

  it('o histórico do Cliente não inclui evento interno da equipe', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    const tipos = visao.eventos.map((e) => e.tipo)
    expect(tipos).toContain('servico_contratado')
    expect(tipos).toContain('atendimento_criado')
    expect(tipos).toContain('status_alterado')
    // Definição de responsável é organização interna.
    expect(tipos).not.toContain('responsavel_definido')
  })

  it('o Cliente recebe protocolo, valor e status reais', async () => {
    const servicoId = await criarServicoDoPrestador()
    await contratarComo('cliente', servicoId)
    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)

    expect(visao.protocolo).toMatch(/^#\d{4}-\d{4}$/)
    expect(visao.status).toBe('novo')
    expect(visao.contratacao?.valorCentavos).toBe(10000)
    expect(visao.prestador.nome).toBe('Atendimento prestador')
  })
})

describe('fonte única de dados da tela', () => {
  /**
   * O quadro passou a ler só do banco.
   *
   * Antes esta suíte checava a consolidação de reais + nove cards de
   * demonstração. Os mocks saíram nesta etapa, e o que resta a garantir é o
   * contrato que ficou: tudo o que a tela recebe existe como registro, e o
   * mapeamento para o card não inventa dado nenhum.
   */
  it('todo card do quadro corresponde a um Atendimento gravado', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const reais = await listarAtendimentosDoPrestador(contas.prestador.id)
    const cards = reais.map((atendimento) =>
      mapearAtendimentoParaCard(atendimento, contas.prestador.id),
    )

    const gravados = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.prestadorId, contas.prestador.id))
    const idsGravados = new Set(gravados.map((linha) => linha.id))

    expect(cards.map((card) => card.id)).toContain(atendimentoId)
    for (const card of cards) {
      expect(idsGravados.has(card.id)).toBe(true)
      expect(card.origin).toBe('real')
      // Sem checklist não existe barra de progresso inventada.
      expect(card.number).toMatch(/^#\d{4}-\d{4}$/)
    }
  })
})

describe('prioridade e prazo', () => {
  /** Cliente contrata e um segundo profissional entra como convidado. */
  async function cenarioComEquipe() {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      papel: 'convidado',
    })
    return atendimentoId
  }

  async function lerAtendimento(atendimentoId: string) {
    const [linha] = await db
      .select({
        prioridade: atendimentos.prioridade,
        prazoEm: atendimentos.prazoEm,
      })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    return linha
  }

  async function eventos(atendimentoId: string, tipo: string) {
    return await db
      .select({
        descricao: atendimentoEventos.descricao,
        autorId: atendimentoEventos.autorId,
        visivelCliente: atendimentoEventos.visivelCliente,
        metadados: atendimentoEventos.metadados,
        criadoEm: atendimentoEventos.createdAt,
      })
      .from(atendimentoEventos)
      .where(
        and(
          eq(atendimentoEventos.atendimentoId, atendimentoId),
          eq(atendimentoEventos.tipo, tipo),
        ),
      )
  }

  it('a equipe altera a prioridade e o histórico guarda o antes e o depois', async () => {
    const atendimentoId = await cenarioComEquipe()
    expect((await lerAtendimento(atendimentoId)).prioridade).toBe('media')

    const resultado = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prioridade: 'alta',
    })

    expect(resultado).toEqual({ sucesso: true, alterado: true })
    expect((await lerAtendimento(atendimentoId)).prioridade).toBe('alta')

    const [evento] = await eventos(atendimentoId, 'prioridade_alterada')
    expect(evento.descricao).toContain('de Média para Alta')
    expect(evento.autorId).toBe(contas.prestador.id)
    expect(evento.criadoEm).toBeInstanceOf(Date)
    expect(evento.metadados).toMatchObject({ de: 'media', para: 'alta' })
  })

  it('o Cliente não altera a prioridade, nem chamando a regra direto', async () => {
    const atendimentoId = await cenarioComEquipe()

    const resultado = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      prioridade: 'alta',
    })

    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
    expect((await lerAtendimento(atendimentoId)).prioridade).toBe('media')
    expect(await eventos(atendimentoId, 'prioridade_alterada')).toHaveLength(0)
  })

  it('participante convidado é equipe: pode priorizar', async () => {
    const atendimentoId = await cenarioComEquipe()

    const resultado = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      prioridade: 'baixa',
    })

    expect(resultado).toEqual({ sucesso: true, alterado: true })
    expect((await lerAtendimento(atendimentoId)).prioridade).toBe('baixa')
  })

  it('quem não tem vínculo nenhum é recusado', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const prioridade = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      prioridade: 'alta',
    })
    const prazo = await definirPrazoDoAtendimento({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      prazoEm: new Date('2026-12-01T12:00:00.000Z'),
    })

    expect(prioridade).toEqual({ sucesso: false, motivo: 'sem-acesso' })
    expect(prazo).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })

  it('repetir a mesma prioridade não vira linha de histórico', async () => {
    const atendimentoId = await cenarioComEquipe()

    const resultado = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prioridade: 'media',
    })

    expect(resultado).toEqual({ sucesso: true, alterado: false })
    expect(await eventos(atendimentoId, 'prioridade_alterada')).toHaveLength(0)
  })

  it('a prioridade chega ao Cliente como informação — o histórico dela não', async () => {
    const atendimentoId = await cenarioComEquipe()
    await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prioridade: 'alta',
    })

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visao.prioridade).toBe('alta')
    // O vaivém da fila interna não entra no histórico do Cliente.
    expect(visao.eventos.map((e) => e.tipo)).not.toContain('prioridade_alterada')
  })

  it('a equipe define o prazo e o Cliente enxerga o novo compromisso', async () => {
    const atendimentoId = await cenarioComEquipe()
    const novoPrazo = new Date('2026-12-01T12:00:00.000Z')

    const resultado = await definirPrazoDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prazoEm: novoPrazo,
    })

    expect(resultado).toEqual({ sucesso: true, alterado: true })
    expect((await lerAtendimento(atendimentoId)).prazoEm?.toISOString()).toBe(
      novoPrazo.toISOString(),
    )

    const [evento] = await eventos(atendimentoId, 'prazo_definido')
    expect(evento.autorId).toBe(contas.prestador.id)
    // Prazo é compromisso com o Cliente: aparece no histórico dele.
    expect(evento.visivelCliente).toBe(true)

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visao.prazoEm).toBe(novoPrazo.toISOString())
    expect(visao.eventos.map((e) => e.tipo)).toContain('prazo_definido')
  })

  it('o Cliente não escolhe prazo', async () => {
    const atendimentoId = await cenarioComEquipe()
    const antes = (await lerAtendimento(atendimentoId)).prazoEm

    const resultado = await definirPrazoDoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      prazoEm: new Date('2027-01-01T12:00:00.000Z'),
    })

    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
    expect((await lerAtendimento(atendimentoId)).prazoEm?.toISOString()).toBe(
      antes?.toISOString(),
    )
  })

  it('serviço sem prazo no catálogo nasce sem prazo e a equipe define depois', async () => {
    const servicoId = await criarServicoDoPrestador({
      nome: 'Consulta sem prazo',
      prazoEstimadoDias: undefined,
    })
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    expect((await lerAtendimento(atendimentoId)).prazoEm).toBeNull()

    await definirPrazoDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prazoEm: new Date('2026-11-10T12:00:00.000Z'),
    })

    const [evento] = await eventos(atendimentoId, 'prazo_definido')
    expect(evento.descricao).toContain('Prazo definido para')
    expect((await lerAtendimento(atendimentoId)).prazoEm).not.toBeNull()
  })

  it('prazo do catálogo é a base do Atendimento', async () => {
    const servicoId = await criarServicoDoPrestador({ prazoEstimadoDias: 3 })
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const linha = await lerAtendimento(atendimentoId)
    const [contratacao] = await db
      .select({ criadaEm: contratacoesServico.createdAt })
      .from(contratacoesServico)
      .innerJoin(atendimentos, eq(atendimentos.contratacaoId, contratacoesServico.id))
      .where(eq(atendimentos.id, atendimentoId))

    const esperado = contratacao.criadaEm.getTime() + 3 * 24 * 60 * 60 * 1000
    expect(linha.prazoEm?.getTime()).toBe(esperado)
  })

  it('limpar o prazo devolve o Atendimento a "sem prazo"', async () => {
    const atendimentoId = await cenarioComEquipe()

    const resultado = await definirPrazoDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      prazoEm: null,
    })

    expect(resultado).toEqual({ sucesso: true, alterado: true })
    expect((await lerAtendimento(atendimentoId)).prazoEm).toBeNull()

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visao.prazoEm).toBeNull()
  })

  it('data escolhida no campo vira o dia certo, não o anterior', () => {
    // `new Date('2026-09-30')` seria meia-noite em UTC — 29/09 às 21h no Brasil.
    const prazo = interpretarPrazo('2026-09-30')
    expect(prazo.getFullYear()).toBe(2026)
    expect(prazo.getMonth()).toBe(8)
    expect(prazo.getDate()).toBe(30)
    expect(prazo.toLocaleDateString('pt-BR')).toBe('30/09/2026')
  })

  it('o card do prestador traz o código do Cliente para a busca', async () => {
    const servicoId = await criarServicoDoPrestador()
    const { atendimentoId } = await contratarComo('cliente', servicoId)

    const lista = await listarAtendimentosDoPrestador(contas.prestador.id)
    const alvo = lista.find((a) => a.id === atendimentoId)
    expect(alvo?.cliente.codigo).toMatch(/^CLI-[0-9A-F]{8}$/)
    expect(alvo?.cliente.nome).toBe('Atendimento cliente')
  })
})

describe('checklist do Atendimento', () => {
  const ETAPAS = [
    'Receber documentos',
    'Conferir dados',
    'Definir CNAE',
    'Realizar abertura',
    'Entregar documentação',
  ]

  async function cenarioComChecklist(etapas = ETAPAS) {
    const servicoId = await criarServicoDoPrestador({ checklistModelo: etapas })
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    return { servicoId, atendimentoId }
  }

  async function etapasDoAtendimento(atendimentoId: string) {
    return await db
      .select({
        id: atendimentoChecklistItens.id,
        titulo: atendimentoChecklistItens.titulo,
        concluido: atendimentoChecklistItens.concluido,
        ordem: atendimentoChecklistItens.ordem,
        origem: atendimentoChecklistItens.origem,
        visibilidade: atendimentoChecklistItens.visibilidade,
      })
      .from(atendimentoChecklistItens)
      .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
      .orderBy(atendimentoChecklistItens.ordem)
  }

  it('a contratação copia as etapas do catálogo para o Atendimento', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    const etapas = await etapasDoAtendimento(atendimentoId)

    expect(etapas.map((e) => e.titulo)).toEqual(ETAPAS)
    expect(etapas.every((e) => e.concluido === false)).toBe(true)
    expect(etapas.every((e) => e.origem === 'catalogo')).toBe(true)
  })

  it('mudar o catálogo depois não mexe no checklist já contratado', async () => {
    const { servicoId, atendimentoId } = await cenarioComChecklist()

    await db
      .update(servicos)
      .set({ checklistModelo: ['Outra etapa completamente diferente'] })
      .where(eq(servicos.id, servicoId))

    const etapas = await etapasDoAtendimento(atendimentoId)
    expect(etapas.map((e) => e.titulo)).toEqual(ETAPAS)
  })

  it('serviço sem checklist não inventa etapa nenhuma', async () => {
    const { atendimentoId } = await cenarioComChecklist([])
    expect(await etapasDoAtendimento(atendimentoId)).toHaveLength(0)
  })

  it('a equipe conclui e reabre etapas, e o histórico registra as duas coisas', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    const [primeira] = await etapasDoAtendimento(atendimentoId)

    await alternarItemDoChecklist({
      itemId: primeira.id,
      usuarioId: contas.prestador.id,
      concluido: true,
    })
    let etapas = await etapasDoAtendimento(atendimentoId)
    expect(etapas[0].concluido).toBe(true)

    await alternarItemDoChecklist({
      itemId: primeira.id,
      usuarioId: contas.prestador.id,
      concluido: false,
    })
    etapas = await etapasDoAtendimento(atendimentoId)
    expect(etapas[0].concluido).toBe(false)

    const tipos = (
      await db
        .select({ tipo: atendimentoEventos.tipo })
        .from(atendimentoEventos)
        .where(eq(atendimentoEventos.atendimentoId, atendimentoId))
    ).map((e) => e.tipo)

    expect(tipos).toContain('checklist_criado')
    expect(tipos).toContain('checklist_item_concluido')
    expect(tipos).toContain('checklist_item_reaberto')
  })

  it('o Cliente não administra o checklist', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    const [primeira] = await etapasDoAtendimento(atendimentoId)

    const marcar = await alternarItemDoChecklist({
      itemId: primeira.id,
      usuarioId: contas.cliente.id,
      concluido: true,
    })
    const adicionar = await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.cliente.id,
      titulo: 'Etapa criada pelo Cliente',
    })
    const remover = await removerItemDoChecklist({
      itemId: primeira.id,
      usuarioId: contas.cliente.id,
    })
    const reordenar = await reordenarChecklist({
      atendimentoId,
      usuarioId: contas.cliente.id,
      ordemDosItens: [primeira.id],
    })

    for (const resultado of [marcar, adicionar, remover, reordenar]) {
      expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
    }
    const etapas = await etapasDoAtendimento(atendimentoId)
    expect(etapas).toHaveLength(ETAPAS.length)
    expect(etapas[0].concluido).toBe(false)
  })

  it('quem não tem vínculo com o Atendimento também não mexe no checklist', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    const resultado = await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.outroPrestador.id,
      titulo: 'Etapa de fora',
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })

  it('etapa interna fica fora do checklist do Cliente', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.prestador.id,
      titulo: 'Conferir margem interna do escritório',
      visibilidade: 'interno',
    })

    const daEquipe = await listarChecklistDoAtendimento(atendimentoId, {
      somentePublicas: false,
    })
    const doCliente = await listarChecklistDoAtendimento(atendimentoId, {
      somentePublicas: true,
    })

    expect(daEquipe).toHaveLength(ETAPAS.length + 1)
    expect(doCliente).toHaveLength(ETAPAS.length)
    expect(JSON.stringify(doCliente)).not.toContain('margem interna')

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(visao.checklist).toHaveLength(ETAPAS.length)
    expect(JSON.stringify(visao)).not.toContain('margem interna')
  })

  it('reordenar troca a ordem das etapas', async () => {
    const { atendimentoId } = await cenarioComChecklist()
    const etapas = await etapasDoAtendimento(atendimentoId)
    const invertida = [...etapas].reverse().map((e) => e.id)

    await reordenarChecklist({
      atendimentoId,
      usuarioId: contas.prestador.id,
      ordemDosItens: invertida,
    })

    const depois = await etapasDoAtendimento(atendimentoId)
    expect(depois.map((e) => e.titulo)).toEqual([...ETAPAS].reverse())
  })

  it('progresso é derivado das etapas, nunca gravado', async () => {
    const { atendimentoId } = await cenarioComChecklist([
      ...ETAPAS,
      'Emitir alvará',
      'Entregar certificado',
    ])
    const etapas = await etapasDoAtendimento(atendimentoId)
    for (const etapa of etapas.slice(0, 4)) {
      await alternarItemDoChecklist({
        itemId: etapa.id,
        usuarioId: contas.prestador.id,
        concluido: true,
      })
    }

    const visao = await listarAtendimentosDoPrestador(contas.prestador.id)
    const alvo = visao.find((a) => a.id === atendimentoId)!
    expect(calcularProgresso(alvo.checklist)).toEqual({
      done: 4,
      total: 7,
      percentual: 57,
    })
  })
})

describe('solicitação ao Cliente', () => {
  async function emAndamento() {
    const servicoId = await criarServicoDoPrestador({
      checklistModelo: ['Receber documentos'],
    })
    const { atendimentoId } = await contratarComo('cliente', servicoId)
    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })
    return atendimentoId
  }

  it('registra no Protocolo, cria a etapa e move para Aguardando cliente', async () => {
    const atendimentoId = await emAndamento()

    const resultado = await solicitarAoCliente({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Envie RG, CPF e comprovante de endereço.',
      etapaChecklist: 'Receber documentos do Cliente',
    })

    expect(resultado.sucesso).toBe(true)

    const [atendimento] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(atendimento.status).toBe('aguardando_cliente')

    const manifestacoes = await db
      .select({ conteudo: atendimentoManifestacoes.conteudo })
      .from(atendimentoManifestacoes)
      .where(eq(atendimentoManifestacoes.atendimentoId, atendimentoId))
    expect(manifestacoes.map((m) => m.conteudo)).toContain(
      'Envie RG, CPF e comprovante de endereço.',
    )

    const etapas = await db
      .select({
        titulo: atendimentoChecklistItens.titulo,
        origem: atendimentoChecklistItens.origem,
      })
      .from(atendimentoChecklistItens)
      .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
    expect(etapas.map((e) => e.titulo)).toContain('Receber documentos do Cliente')
    expect(etapas.find((e) => e.origem === 'solicitacao')).toBeTruthy()
  })

  it('o Cliente vê a solicitação e a pendência, mas nada conclui sozinho', async () => {
    const atendimentoId = await emAndamento()
    await solicitarAoCliente({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Envie o contrato social assinado.',
      etapaChecklist: 'Receber contrato social',
    })

    // O Cliente responde no Protocolo dizendo que enviou.
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Enviei os documentos agora.',
    })

    const [depois] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    // Responder não conclui etapa nem devolve o Atendimento para a equipe:
    // quem confere é quem executa.
    expect(depois.status).toBe('aguardando_cliente')

    const etapas = await db
      .select({ concluido: atendimentoChecklistItens.concluido })
      .from(atendimentoChecklistItens)
      .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
    expect(etapas.every((e) => e.concluido === false)).toBe(true)

    const [visao] = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(JSON.stringify(visao.manifestacoes)).toContain('contrato social assinado')
    expect(visao.checklist.map((e) => e.titulo)).toContain('Receber contrato social')
    expect(visao.eventos.map((e) => e.tipo)).toContain('solicitacao_ao_cliente')
  })

  it('depois de conferir, a equipe conclui a etapa e retoma o atendimento', async () => {
    const atendimentoId = await emAndamento()
    await solicitarAoCliente({
      atendimentoId,
      usuarioId: contas.prestador.id,
      conteudo: 'Envie o comprovante de endereço.',
      etapaChecklist: 'Receber comprovante de endereço',
    })

    const [pendencia] = await db
      .select({ id: atendimentoChecklistItens.id })
      .from(atendimentoChecklistItens)
      .where(
        and(
          eq(atendimentoChecklistItens.atendimentoId, atendimentoId),
          eq(atendimentoChecklistItens.origem, 'solicitacao'),
        ),
      )

    await alternarItemDoChecklist({
      itemId: pendencia.id,
      usuarioId: contas.prestador.id,
      concluido: true,
    })
    const retomada = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.prestador.id,
      destino: 'em_andamento',
    })

    expect(retomada.sucesso).toBe(true)
    const [linha] = await db
      .select({ status: atendimentos.status })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId))
    expect(linha.status).toBe('em_andamento')
  })

  it('o Cliente não solicita nada a si mesmo', async () => {
    const atendimentoId = await emAndamento()
    const resultado = await solicitarAoCliente({
      atendimentoId,
      usuarioId: contas.cliente.id,
      conteudo: 'Mudem o status para aguardando.',
    })
    expect(resultado).toEqual({ sucesso: false, motivo: 'sem-acesso' })
  })
})
