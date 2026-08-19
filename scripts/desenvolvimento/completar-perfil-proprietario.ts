/**
 * ⚠️ DESCONTINUADO — não use em contas novas.
 *
 * Este script cria um `perfis_profissionais` com `status_analise = 'aprovado'`
 * sem nenhuma comprovação de habilitação: endereço vem de parâmetro com valor
 * padrão, não há CRC/OAB e não há comprovante. Ou seja, produz uma aprovação
 * artificial, só para destravar o roteamento.
 *
 * A causa que ele contornava foi corrigida na origem: `criarEmpresaComMembro`
 * agora exige cadastro profissional aprovado para criar o vínculo de
 * proprietário, então não nascem mais proprietários sem perfil.
 *
 * Para diagnosticar contas afetadas use, sem alterar nada:
 *   node --env-file=.env --import tsx scripts/desenvolvimento/auditar-tipos-prestador.ts
 *
 * A correção legítima é o titular preencher o cadastro real em
 * /cadastro-profissional (registro, comprovante, endereço e formação).
 *
 * ---
 *
 * Completa o perfil profissional de contas que já são proprietárias de um
 * escritório ativo mas ficaram sem registro em `perfis_profissionais`.
 *
 * Contexto: o onboarding antigo (`criarEmpresaComMembro`) criava empresa +
 * membro proprietário sem exigir cadastro profissional. Depois disso o roteamento
 * passou a exigir `perfis_profissionais.status_analise = 'aprovado'` para liberar
 * `/admin`, então essas contas legadas caem em `/cadastro-profissional`.
 *
 * O script não conhece nenhum e-mail: recebe o endereço por argumento e só age
 * quando os dados provam que a conta é proprietária ativa de uma empresa ativa.
 *
 * Uso:
 *   node --env-file=.env --import tsx scripts/desenvolvimento/completar-perfil-proprietario.ts <email> [--cidade "Belo Horizonte"] [--estado MG]
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import {
  empresaMembros,
  empresas,
  perfisProfissionais,
  usuarios,
} from '../../src/db/schema'

type Segmento = 'advocacia' | 'contabilidade' | null

function tipoProfissionalDoSegmento(segmento: Segmento) {
  return segmento === 'advocacia' ? 'advocacia' : 'contabilidade'
}

function lerOpcao(nome: string, padrao: string) {
  const indice = process.argv.indexOf(`--${nome}`)
  if (indice === -1) return padrao
  return process.argv[indice + 1] ?? padrao
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não pode ser executado em produção.')
  }

  // Exige confirmação explícita: o perfil gerado aqui não representa
  // habilitação verificada e não deve ser criado por engano.
  if (!process.argv.includes('--confirmo-perfil-artificial')) {
    throw new Error(
      'Script descontinuado: cria aprovação sem comprovação de habilitação.\n' +
        'Use scripts/desenvolvimento/auditar-tipos-prestador.ts para diagnosticar e\n' +
        '/cadastro-profissional para preencher os dados reais.\n' +
        'Se ainda assim precisar dele em desenvolvimento, repita o comando com\n' +
        '--confirmo-perfil-artificial.',
    )
  }

  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || email.startsWith('--')) {
    throw new Error('Informe o e-mail da conta proprietária como primeiro argumento.')
  }

  // Endereço é obrigatório na tabela; em desenvolvimento aceitamos parâmetro e
  // mantemos o mesmo endereço público usado pelos demais scripts locais.
  const cidade = lerOpcao('cidade', 'Belo Horizonte')
  const estado = lerOpcao('estado', 'MG').toUpperCase()

  const [usuario] = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
    })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1)

  if (!usuario) throw new Error(`Usuário não encontrado: ${email}`)

  const [vinculo] = await db
    .select({
      empresaId: empresas.id,
      empresaNome: empresas.nome,
      segmento: empresas.segmento,
      funcao: empresaMembros.funcao,
    })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(
      and(
        eq(empresaMembros.usuarioId, usuario.id),
        eq(empresaMembros.funcao, 'proprietario'),
        eq(empresaMembros.status, 'ativo'),
        eq(empresas.status, 'ativo'),
      ),
    )
    .limit(1)

  if (!vinculo) {
    throw new Error(
      'A conta não é proprietária ativa de nenhum escritório ativo. Nada foi alterado — o cadastro profissional precisa ser preenchido pelo fluxo normal.',
    )
  }

  const [perfilExistente] = await db
    .select({ id: perfisProfissionais.id, status: perfisProfissionais.statusAnalise })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuario.id))
    .limit(1)

  if (perfilExistente) {
    console.log(
      `A conta já possui perfil profissional (status: ${perfilExistente.status}). Nada foi alterado.`,
    )
    return
  }

  const agora = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(perfisProfissionais).values({
      usuarioId: usuario.id,
      tipoProfissional: tipoProfissionalDoSegmento(vinculo.segmento as Segmento),
      areasAtuacao: [],
      apresentacao: `Perfil do escritório ${vinculo.empresaNome}.`,
      nomeAtuacao: vinculo.empresaNome,
      // A conta é proprietária de escritório: a modalidade precisa refletir isso
      // para que `garantirEscritorioProfissional` reconheça o vínculo existente.
      modalidadeAtuacao: 'escritorio',
      cidade,
      estado,
      telefoneContato: usuario.whatsapp ?? '',
      emailProfissional: usuario.email,
      statusAnalise: 'aprovado',
      enviadoEm: agora,
      analisadoEm: agora,
    })

    // Mantém `usuarios.empresa_id` coerente com o vínculo ativo, como faz o
    // fluxo normal ao entrar em /admin.
    await tx
      .update(usuarios)
      .set({ empresaId: vinculo.empresaId, updatedAt: agora })
      .where(eq(usuarios.id, usuario.id))
  })

  console.log(
    `Perfil profissional criado para ${usuario.email} como proprietário do escritório "${vinculo.empresaNome}".`,
  )
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  },
)
