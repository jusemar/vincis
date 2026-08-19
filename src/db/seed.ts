import { db } from './connection'
import { perfis } from './tables/perfis/tabela'
import { permissoes } from './tables/permissoes/tabela'
import { perfisPermissoes } from './tables/perfis_permissoes/tabela'
import { eq } from 'drizzle-orm'

const perfisIniciais = [
  { nome: 'cliente', descricao: 'Cliente que busca serviços jurídicos ou contábeis' },
  { nome: 'contador', descricao: 'Profissional de contabilidade' },
  { nome: 'advogado', descricao: 'Profissional de advocacia' },
  { nome: 'profissional', descricao: 'Profissional autônomo da plataforma' },
  {
    nome: 'colaborador',
    descricao: 'Prestador com conhecimento técnico, sem habilitação regulamentada',
  },
  { nome: 'gestor_vincis', descricao: 'Gestor interno da plataforma Vincis' },
] as const

const permissoesIniciais = [
  { nome: 'usuarios.visualizar', descricao: 'Visualizar usuários' },
  { nome: 'usuarios.criar', descricao: 'Criar usuários' },
  { nome: 'usuarios.editar', descricao: 'Editar usuários' },
  { nome: 'usuarios.excluir', descricao: 'Excluir usuários' },
  { nome: 'empresas.visualizar', descricao: 'Visualizar empresas' },
  { nome: 'empresas.criar', descricao: 'Criar empresas' },
  { nome: 'empresas.editar', descricao: 'Editar empresas' },
  { nome: 'documentos.visualizar', descricao: 'Visualizar documentos' },
  { nome: 'documentos.criar', descricao: 'Criar documentos' },
  { nome: 'documentos.editar', descricao: 'Editar documentos' },
  { nome: 'contratos.visualizar', descricao: 'Visualizar contratos' },
  { nome: 'contratos.criar', descricao: 'Criar contratos' },
  { nome: 'contratos.editar', descricao: 'Editar contratos' },
  { nome: 'atendimentos.visualizar', descricao: 'Visualizar atendimentos' },
  { nome: 'atendimentos.criar', descricao: 'Criar atendimentos' },
  { nome: 'pagamentos.visualizar', descricao: 'Visualizar pagamentos' },
  { nome: 'auditoria.visualizar', descricao: 'Visualizar auditoria' },
] as const

const permissoesPorPerfil: Record<string, string[]> = {
  cliente: [
    'usuarios.visualizar',
    'usuarios.editar',
    'documentos.visualizar',
    'contratos.visualizar',
    'atendimentos.visualizar',
    'atendimentos.criar',
    'pagamentos.visualizar',
  ],
  contador: [
    'usuarios.visualizar',
    'empresas.visualizar',
    'empresas.editar',
    'documentos.visualizar',
    'documentos.criar',
    'documentos.editar',
    'contratos.visualizar',
    'atendimentos.visualizar',
    'pagamentos.visualizar',
    'auditoria.visualizar',
  ],
  advogado: [
    'usuarios.visualizar',
    'empresas.visualizar',
    'documentos.visualizar',
    'documentos.criar',
    'documentos.editar',
    'contratos.visualizar',
    'contratos.criar',
    'contratos.editar',
    'atendimentos.visualizar',
    'atendimentos.criar',
    'pagamentos.visualizar',
    'auditoria.visualizar',
  ],
  profissional: [
    'usuarios.visualizar',
    'usuarios.editar',
    'empresas.visualizar',
    'documentos.visualizar',
    'documentos.criar',
    'contratos.visualizar',
    'contratos.criar',
    'atendimentos.visualizar',
    'atendimentos.criar',
    'pagamentos.visualizar',
  ],
  // O colaborador opera sobre os clientes a que tem acesso, mas não emite
  // contratos — atividade que pressupõe habilitação regulamentada.
  colaborador: [
    'usuarios.visualizar',
    'usuarios.editar',
    'empresas.visualizar',
    'documentos.visualizar',
    'documentos.criar',
    'contratos.visualizar',
    'atendimentos.visualizar',
    'atendimentos.criar',
  ],
}

async function seedPerfis() {
  console.log('▶ Seed de perfis...')
  for (const perfil of perfisIniciais) {
    await db.insert(perfis).values(perfil).onConflictDoNothing({ target: perfis.nome })
    console.log(`  ✓ Perfil "${perfil.nome}"`)
  }
}

async function seedPermissoes() {
  console.log('▶ Seed de permissões...')
  for (const permissao of permissoesIniciais) {
    await db.insert(permissoes).values(permissao).onConflictDoNothing({ target: permissoes.nome })
    console.log(`  ✓ Permissão "${permissao.nome}"`)
  }
}

async function seedPerfisPermissoes() {
  console.log('▶ Seed de vínculos permissão-perfil...')
  for (const [perfilNome, permissoesNomes] of Object.entries(permissoesPorPerfil)) {
    const [perfil] = await db.select({ id: perfis.id }).from(perfis).where(eq(perfis.nome, perfilNome))

    if (!perfil) {
      console.log(`  ⚠ Perfil "${perfilNome}" não encontrado, pulando...`)
      continue
    }

    for (const permissaoNome of permissoesNomes) {
      const [permissao] = await db
        .select({ id: permissoes.id })
        .from(permissoes)
        .where(eq(permissoes.nome, permissaoNome))

      if (!permissao) {
        console.log(`  ⚠ Permissão "${permissaoNome}" não encontrada, pulando...`)
        continue
      }

      await db
        .insert(perfisPermissoes)
        .values({ perfilId: perfil.id, permissaoId: permissao.id })
        .onConflictDoNothing()

      console.log(`  ✓ ${perfilNome} → ${permissaoNome}`)
    }
  }
}

async function main() {
  console.log('▶ Iniciando seed...\n')

  await seedPerfis()
  console.log()
  await seedPermissoes()
  console.log()
  await seedPerfisPermissoes()

  console.log('\n✔ Seed concluído com sucesso.')
  process.exit(0)
}

main().catch((error) => {
  console.error('✖ Erro no seed:', error)
  process.exit(1)
})
