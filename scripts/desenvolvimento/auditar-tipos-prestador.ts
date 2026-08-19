/**
 * Relatório SOMENTE LEITURA da coerência entre tipo da pessoa, cadastro de
 * prestador e papel no escritório. Não altera nenhum dado.
 *
 * Serve para separar o que é dado real do que foi regularização artificial —
 * dados ambíguos são reportados, nunca classificados por adivinhação.
 *
 * Uso:
 *   node --env-file=.env --import tsx scripts/desenvolvimento/auditar-tipos-prestador.ts
 */
import { db } from '../../src/db/connection'
import { sql } from 'drizzle-orm'

type Linha = Record<string, unknown>

async function consultar(titulo: string, explicacao: string, query: Promise<unknown>) {
  const linhas = (await query) as Linha[]
  console.log(`\n=== ${titulo} (${linhas.length}) ===`)
  console.log(explicacao)
  if (!linhas.length) return console.log('  nenhuma ocorrência.')
  console.table(linhas)
}

async function main() {
  await consultar(
    'Proprietários sem cadastro profissional aprovado',
    'Proprietário de escritório precisa ser Profissional aprovado. Ocorrências aqui\n' +
      'só existem se vierem do onboarding antigo, que não fazia essa exigência.',
    db.execute(sql`
      select u.email, e.nome as escritorio, pp.tipo_prestador, pp.status_analise
      from empresa_membros em
      join empresas e on e.id = em.empresa_id
      join usuarios u on u.id = em.usuario_id
      left join perfis_profissionais pp on pp.usuario_id = u.id
      where em.funcao = 'proprietario' and em.status = 'ativo'
        and (pp.id is null or pp.tipo_prestador <> 'profissional'
             or pp.status_analise <> 'aprovado')
      order by u.email`),
  )

  await consultar(
    'Profissionais regulamentados aprovados sem comprovação de habilitação',
    'Contador/advogado aprovado sem número de registro e sem comprovante: a\n' +
      'habilitação não foi verificada. Indica aprovação criada por script/seed,\n' +
      'não análise real. Só o titular pode preencher os dados verdadeiros.',
    db.execute(sql`
      select u.email, pp.tipo_profissional, pp.numero_registro,
             pp.comprovante_registro_chave is not null as tem_comprovante,
             pp.formacao, pp.analisado_em, pp.created_at
      from perfis_profissionais pp
      join usuarios u on u.id = pp.usuario_id
      where pp.tipo_prestador = 'profissional'
        and pp.status_analise = 'aprovado'
        and pp.tipo_profissional in ('contabilidade', 'advocacia')
        and coalesce(pp.numero_registro, '') = ''
        and pp.comprovante_registro_chave is null
      order by pp.created_at`),
  )

  await consultar(
    'AMBÍGUO — categoria "especialista_fiscal" classificada como Profissional',
    'Categoria antiga que nunca exigiu registro regulamentado. Sob a nova regra\n' +
      'essas pessoas podem ser Colaboradores, mas isso não é dedutível do dado:\n' +
      'só o titular ou a Gestão pode decidir. NÃO reclassificar por adivinhação.',
    db.execute(sql`
      select u.email, pp.tipo_profissional, pp.status_analise, pp.formacao,
             pp.modalidade_atuacao, pp.created_at
      from perfis_profissionais pp
      join usuarios u on u.id = pp.usuario_id
      where pp.tipo_prestador = 'profissional'
        and pp.tipo_profissional = 'especialista_fiscal'
      order by pp.created_at`),
  )

  await consultar(
    'Papéis de escritório incompatíveis com o tipo da pessoa',
    'Papel "profissional" exige pessoa do tipo Profissional; papel "colaborador"\n' +
      'exige pessoa do tipo Colaborador. O servidor já recusa novos casos assim.',
    db.execute(sql`
      select u.email, e.nome as escritorio, em.funcao as papel,
             coalesce(pp.tipo_prestador, 'sem cadastro') as tipo_pessoa
      from empresa_membros em
      join empresas e on e.id = em.empresa_id
      join usuarios u on u.id = em.usuario_id
      left join perfis_profissionais pp on pp.usuario_id = u.id
      where em.status = 'ativo'
        and (
          (em.funcao = 'profissional' and coalesce(pp.tipo_prestador, '') <> 'profissional')
          or (em.funcao = 'colaborador' and coalesce(pp.tipo_prestador, '') <> 'colaborador')
          or (em.funcao = 'proprietario' and coalesce(pp.tipo_prestador, '') <> 'profissional')
        )
      order by e.nome, u.email`),
  )

  await consultar(
    'Membros sem papel registrado (vínculo legado)',
    'Linhas anteriores à introdução de `funcao`. Continuam funcionando pela regra\n' +
      'de compatibilidade legada em `podeAdministrarEscritorio`.',
    db.execute(sql`
      select u.email, e.nome as escritorio, em.created_at
      from empresa_membros em
      join empresas e on e.id = em.empresa_id
      join usuarios u on u.id = em.usuario_id
      where em.status = 'ativo' and em.funcao is null
      order by em.created_at`),
  )

  await consultar(
    'Cadastro de prestador em desacordo com o perfil da conta',
    'O tipo gravado no cadastro precisa bater com o perfil em `usuarios_perfis`,\n' +
      'senão a conta fica sem destino coerente no roteamento.',
    db.execute(sql`
      select u.email, pp.tipo_prestador,
             (select string_agg(p.nome, ',') from usuarios_perfis up
              join perfis p on p.id = up.perfil_id where up.usuario_id = u.id) as perfis
      from perfis_profissionais pp
      join usuarios u on u.id = pp.usuario_id
      where (pp.tipo_prestador = 'colaborador') <> exists (
        select 1 from usuarios_perfis up join perfis p on p.id = up.perfil_id
        where up.usuario_id = u.id and p.nome = 'colaborador')
      order by u.email`),
  )

  await consultar(
    'Contas de prestador ainda sem cadastro preenchido',
    'Situação normal e esperada: são contas que ainda estão no onboarding.',
    db.execute(sql`
      select u.email, u.status,
             (select string_agg(p.nome, ',') from usuarios_perfis up
              join perfis p on p.id = up.perfil_id where up.usuario_id = u.id) as perfis
      from usuarios u
      where not exists (select 1 from perfis_profissionais pp where pp.usuario_id = u.id)
        and exists (
          select 1 from usuarios_perfis up join perfis p on p.id = up.perfil_id
          where up.usuario_id = u.id
            and p.nome in ('profissional', 'contador', 'advogado', 'colaborador'))
      order by u.email`),
  )
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  },
)
