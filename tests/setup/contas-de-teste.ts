import { eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clientes,
  comunicados,
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaPagamentos,
  contratacoesServico,
  perfis,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { limparAtendimentosDosPrestadores } from './limpeza-atendimentos'

export type ContaDeTeste = { id: string; token: string }

export type DefinicaoConta = {
  perfil: string
  prestador?: 'profissional' | 'colaborador'
}

/**
 * Contas reais para um cenário de teste.
 *
 * Cria usuário, perfil, ficha de prestador e sessão gravada — nada é simulado,
 * de modo que `obterSessaoServidor` e as regras de autorização rodem de
 * verdade. O sufixo do e-mail identifica o cenário e é o que a limpeza usa.
 */
export async function criarContas<Chave extends string>(
  sufixo: string,
  definicoes: Record<Chave, DefinicaoConta>,
  prefixoTelefone = '119460',
): Promise<Record<Chave, ContaDeTeste>> {
  await limparContas(sufixo)

  const criadas = {} as Record<Chave, ContaDeTeste>
  let indice = 0

  for (const chave of Object.keys(definicoes) as Chave[]) {
    const definicao = definicoes[chave]
    await db.insert(perfis).values({ nome: definicao.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, definicao.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Teste ${chave}`,
        email: `${chave}${sufixo}`,
        whatsapp: `${prefixoTelefone}${String(indice).padStart(5, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (definicao.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: definicao.prestador,
        tipoProfissional: 'contabilidade',
        apresentacao: 'Conta criada por teste automatizado.',
        nomeAtuacao: String(chave),
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${sufixo}`,
        statusAnalise: definicao.prestador === 'colaborador' ? 'ativo' : 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'suite-vincis',
    })

    criadas[chave] = { id: usuario.id, token }
    indice += 1
  }

  return criadas
}

/**
 * Apaga tudo o que aquelas contas produziram.
 *
 * A ordem é dependência real do banco, não preferência: Atendimentos (e o
 * rastro deles) antes das contratações, contratações antes dos serviços, e as
 * contas por último.
 */
export async function limparContas(sufixo: string) {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${sufixo}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  await limparAtendimentosDosPrestadores(ids)
  // Comunicado aponta para o gestor que o assinou: sai antes das contas.
  await db.delete(comunicados).where(inArray(comunicados.autorId, ids))
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, ids))
  /*
   * Consultoria contratada sai antes da agenda que a originou.
   *
   * `consultoria_agendamentos` aponta para a configuração **sem** cascata, e
   * isso é a regra certa em produção: apagar a agenda de um Profissional não
   * pode apagar consultorias que pessoas contrataram e pagaram. O preço é este
   * — a limpeza da suíte precisa desmontar na ordem inversa da criação:
   * pagamento, consultoria, reserva e só então a configuração.
   */
  const agendamentos = await db
    .select({ id: consultoriaAgendamentos.id })
    .from(consultoriaAgendamentos)
    .where(inArray(consultoriaAgendamentos.prestadorId, ids))
  const idsAgendamentos = agendamentos.map(({ id }) => id)
  if (idsAgendamentos.length) {
    await db
      .delete(consultoriaPagamentos)
      .where(inArray(consultoriaPagamentos.agendamentoId, idsAgendamentos))
    await db
      .delete(consultoriaAgendamentos)
      .where(inArray(consultoriaAgendamentos.id, idsAgendamentos))
  }
  // Faixas e exceções saem por cascata da configuração; as reservas também,
  // mas as confirmadas já perderam o agendamento acima.
  await db
    .delete(consultoriaConfiguracoes)
    .where(inArray(consultoriaConfiguracoes.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}
