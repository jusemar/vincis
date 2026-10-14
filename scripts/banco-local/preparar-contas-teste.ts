/**
 * Contas de DESENVOLVIMENTO para testar perfis e áreas da Vincis, no PostgreSQL LOCAL.
 *
 * - `gestor.profissional@vincis.local` — Gestor da plataforma **e** Profissional
 *   contábil aprovado, proprietário de escritório contábil e Parceiro. Cliente
 *   ele já é por ser Gestor (`podeAgirComoCliente`, área `/cliente`): nenhuma
 *   capacidade substitui outra, todas convivem na mesma conta;
 * - `profissional.contabil@vincis.local` — Profissional contábil aprovado, dono
 *   de escritório contábil. Não é Gestor;
 * - `profissional.juridico@vincis.local` — Profissional de advocacia aprovado,
 *   dono de escritório de advocacia. Não é Gestor e fica fora da Central Fiscal.
 *
 * Os dados entram pelas peças reais: perfis em `usuarios_perfis`, cadastro em
 * `perfis_profissionais`, escritório por `criarEmpresaComMembro`. Nenhuma regra
 * de autorização é tocada — o fim do script confere cada conta pelas mesmas
 * funções que o servidor usa (`resolverAcessoUsuario`,
 * `resolverAcessoDocumentosFiscais`, `resolverContextoTenant`).
 *
 * `gestor.local@vincis.local` não é tocado. Só roda contra banco local (guarda)
 * e com `SENHA_CONTAS_LOCAIS` em `.env.local`. Idempotente: rodar de novo só
 * completa o que faltar e nunca reescreve um cadastro divergente.
 *
 * Uso: npm run db:local:contas-teste
 */
import { exigirBancoLocal } from './guarda'
import { lerSenhaContasLocais } from './senha-contas-locais'

exigirBancoLocal(process.env.DATABASE_URL, 'db:local:contas-teste')
const senha = lerSenhaContasLocais('db:local:contas-teste')

const { conexaoPostgres } = await import('../../src/db/connection')
const { cadastroProfissionalAprovadoLocal, contaLocal, escritorioLocal, garantirPerfilDaConta, parceiroLocal } =
  await import('./fixtures')
const { resolverAcessoUsuario } = await import('../../src/features/usuarios/queries/obter-destino-apos-login')
const { podeAgirComoCliente } = await import('../../src/features/usuarios/lib/capacidades')
const { resolverContextoTenant } = await import('../../src/features/empresas/lib/resolver-contexto-tenant')
const { resolverAcessoDocumentosFiscais } = await import(
  '../../src/features/documentos-fiscais/lib/acesso-documentos-fiscais'
)
const { PERMISSOES_DOCUMENTOS_FISCAIS } = await import('../../src/features/documentos-fiscais/constants/permissoes')
const { obterParceiroDoUsuario } = await import('../../src/features/parceiros/queries/obter-parceiro')

type Esperado = {
  ehGestor: boolean
  parceiro: boolean
  centralFiscal: boolean
}

type ContaDeTeste = {
  email: string
  nome: string
  gestor: boolean
  parceiro: boolean
  cadastro: {
    tipoProfissional: 'contabilidade' | 'advocacia'
    numeroRegistro: string
    areasAtuacao: string[]
  }
  escritorio: { nome: string; segmento: 'contabilidade' | 'advocacia' }
  esperado: Esperado
}

const CONTAS: ContaDeTeste[] = [
  {
    email: 'gestor.profissional@vincis.local',
    nome: 'Gestor Profissional Local',
    gestor: true,
    parceiro: true,
    cadastro: {
      tipoProfissional: 'contabilidade',
      numeroRegistro: 'CRC-LOCAL-0001',
      areasAtuacao: ['Contabilidade empresarial', 'Planejamento tributário'],
    },
    escritorio: { nome: 'Escritório Contábil Gestor Local', segmento: 'contabilidade' },
    esperado: { ehGestor: true, parceiro: true, centralFiscal: true },
  },
  {
    email: 'profissional.contabil@vincis.local',
    nome: 'Profissional Contábil Local',
    gestor: false,
    parceiro: false,
    cadastro: {
      tipoProfissional: 'contabilidade',
      numeroRegistro: 'CRC-LOCAL-0002',
      areasAtuacao: ['Contabilidade empresarial', 'Escrita fiscal'],
    },
    escritorio: { nome: 'Escritório Contábil Local', segmento: 'contabilidade' },
    esperado: { ehGestor: false, parceiro: false, centralFiscal: true },
  },
  {
    email: 'profissional.juridico@vincis.local',
    nome: 'Profissional Jurídico Local',
    gestor: false,
    parceiro: false,
    cadastro: {
      tipoProfissional: 'advocacia',
      numeroRegistro: 'OAB-LOCAL-0001',
      areasAtuacao: ['Direito empresarial', 'Contratos'],
    },
    escritorio: { nome: 'Escritório Jurídico Local', segmento: 'advocacia' },
    esperado: { ehGestor: false, parceiro: false, centralFiscal: false },
  },
]

async function preparar(conta: ContaDeTeste) {
  const usuarioId = await contaLocal(conta.email, conta.nome, 'profissional', senha)
  // A conta pode já existir só com parte das capacidades: cada passo abaixo
  // acrescenta o que falta, sem desfazer nada do que já está lá.
  await garantirPerfilDaConta(usuarioId, 'profissional')
  if (conta.gestor) await garantirPerfilDaConta(usuarioId, 'gestor_vincis')
  await cadastroProfissionalAprovadoLocal(usuarioId, {
    ...conta.cadastro,
    nomeAtuacao: conta.escritorio.nome,
    emailProfissional: conta.email,
  })
  const empresaId = await escritorioLocal(usuarioId, conta.escritorio.nome, conta.escritorio.segmento)
  if (conta.parceiro) await parceiroLocal(usuarioId)
  return { usuarioId, empresaId }
}

/** Confere a conta pelas resoluções reais do servidor. Devolve as falhas. */
async function validar(conta: ContaDeTeste, usuarioId: string, empresaId: string) {
  const falhas: string[] = []
  const acesso = await resolverAcessoUsuario(usuarioId)
  if (!acesso) return ['conta sem acesso (inativa ou não verificada)']

  const tenant = await resolverContextoTenant(usuarioId)
  const fiscal = await resolverAcessoDocumentosFiscais(usuarioId, PERMISSOES_DOCUMENTOS_FISCAIS.visualizar, empresaId)
  const parceiro = await obterParceiroDoUsuario(usuarioId)
  const cliente = podeAgirComoCliente({ perfilTipo: acesso.perfil, ehGestor: acesso.ehGestor })
  const escritorio = tenant.sucesso && tenant.estado === 'ativo' ? tenant.contexto : undefined

  const conferir = (rotulo: string, obtido: unknown, esperado: unknown) => {
    if (obtido !== esperado) falhas.push(`${rotulo}: esperado ${String(esperado)}, obtido ${String(obtido)}`)
  }
  conferir('perfil operacional', acesso.perfil, 'profissional')
  conferir('ehGestor', acesso.ehGestor, conta.esperado.ehGestor)
  conferir('prestador habilitado', acesso.habilitado, true)
  conferir('destino', acesso.destino, '/admin')
  conferir('área /cliente', acesso.areasPermitidas.includes('/cliente'), conta.esperado.ehGestor)
  conferir('age como Cliente', cliente, conta.esperado.ehGestor)
  conferir('escritório ativo no painel', escritorio?.empresaId, empresaId)
  conferir('Parceiro', Boolean(parceiro), conta.esperado.parceiro)
  conferir('menu Central Fiscal', acesso.elegivelCentralFiscal, conta.esperado.centralFiscal)
  conferir('Documentos Fiscais (visualizar)', Boolean(fiscal), conta.esperado.centralFiscal)
  if (fiscal) conferir('papel no escritório', fiscal.papel, 'proprietario')

  console.log(
    `${conta.email}\n` +
      `  perfil=${acesso.perfil} gestor=${acesso.ehGestor} habilitado=${acesso.habilitado} ` +
      `status=${acesso.statusProfissional} destino=${acesso.destino}\n` +
      `  áreas=${acesso.areasPermitidas.join(', ')} cliente=${cliente} parceiro=${parceiro?.codigo ?? 'não'}\n` +
      `  escritório=${escritorio ? `${escritorio.nome} (${escritorio.segmento})` : tenant.estado} ` +
      `centralFiscal=${acesso.elegivelCentralFiscal} documentosFiscais=${fiscal ? `sim (${fiscal.papel})` : 'não'}`,
  )
  return falhas
}

let falhou = false
try {
  for (const conta of CONTAS) {
    const { usuarioId, empresaId } = await preparar(conta)
    const falhas = await validar(conta, usuarioId, empresaId)
    for (const falha of falhas) console.error(`  ✗ ${falha}`)
    if (falhas.length === 0) console.log('  ✓ capacidades conferidas')
    falhou ||= falhas.length > 0
  }
  console.log('\nSenha das contas: a de SENHA_CONTAS_LOCAIS em .env.local.')
} finally {
  await conexaoPostgres.end({ timeout: 5 })
}
if (falhou) process.exit(1)
