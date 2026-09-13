import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'
import {
  RECURSOS_ADMIN,
  recursoDaRota,
  recursosPermitidos,
  rotaExigeGestor,
} from '@/features/admin/constants/recursos'
import { exigirGestorDaPlataforma } from '@/features/admin/lib/exigir-gestor'
import { CAPITULOS_MANUAL, TITULO_MANUAL } from '@/features/manual/constants/conteudo'
import { SITUACAO } from '@/features/manual/constants/situacao'
import {
  buscarNoManual,
  normalizarTexto,
  textoDoBloco,
} from '@/features/manual/lib/busca'
import { COOKIE_SESSAO } from '@/features/usuarios/constants/sessao'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

const ROTA_MANUAL = '/admin/manual'
const SUFIXO = '@manual-da-vincis.teste'

type Conta = 'gestor' | 'gestorProfissional' | 'cliente' | 'profissional' | 'colaborador'
let contas: Record<Conta, ContaDeTeste>

beforeAll(async () => {
  contas = await criarContas<Conta>(
    SUFIXO,
    {
      gestor: { perfil: 'gestor_vincis' },
      gestorProfissional: {
        perfil: 'profissional',
        perfisExtras: ['gestor_vincis'],
        prestador: 'profissional',
      },
      cliente: { perfil: 'cliente' },
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      colaborador: { perfil: 'colaborador', prestador: 'colaborador' },
    },
    '119470',
  )
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

/** Pede a rota ao middleware de verdade, com o cookie de sessão da conta. */
async function pedirAoMiddleware(token: string | null) {
  const cabecalhos = new Headers()
  if (token) cabecalhos.set('cookie', `${COOKIE_SESSAO}=${token}`)
  return proxy(new NextRequest(`http://localhost${ROTA_MANUAL}`, { headers: cabecalhos }))
}

/** O middleware deixou passar? (`NextResponse.next()` não redireciona.) */
function passou(resposta: Response) {
  return resposta.headers.get('x-middleware-next') === '1' && !resposta.headers.get('location')
}

/** Para onde o middleware mandou a pessoa. */
function destino(resposta: Response) {
  const location = resposta.headers.get('location')
  return location ? new URL(location).pathname : null
}

/** A guarda de servidor da página: devolve o Gestor ou interrompe com redirecionamento. */
async function guardaDaPagina(token: string | null) {
  entrarComo(token)
  try {
    await exigirGestorDaPlataforma()
    return 'liberada'
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest ?? ''
    if (digest.startsWith('NEXT_REDIRECT')) return 'redirecionada'
    throw erro
  } finally {
    sairDaSessao()
  }
}

describe('Manual da Vincis — menu e registro', () => {
  it('é um recurso exclusivo do Gestor, com item próprio no menu', () => {
    const recurso = RECURSOS_ADMIN.find((r) => r.id === 'manual')
    expect(recurso).toMatchObject({
      rota: ROTA_MANUAL,
      rotulo: 'Manual da Vincis',
      exclusivoDoGestor: true,
      noMenuPrincipal: true,
    })
    expect(rotaExigeGestor(ROTA_MANUAL)).toBe(true)
    expect(recursoDaRota(`${ROTA_MANUAL}/qualquer-coisa`)?.id).toBe('manual')
    // Prefixo parecido não herda a proteção de outro recurso.
    expect(recursoDaRota('/admin/manual-antigo')).toBeNull()
  })

  it('aparece no menu do Gestor e não aparece para quem não é Gestor', () => {
    expect(recursosPermitidos({ ehGestor: true }).map((r) => r.rotulo)).toContain(
      'Manual da Vincis',
    )
    expect(recursosPermitidos({ ehGestor: false }).map((r) => r.rotulo)).not.toContain(
      'Manual da Vincis',
    )
  })
})

describe('Manual da Vincis — acesso pela URL', () => {
  it('o middleware deixa o Gestor entrar, com ou sem escritório', async () => {
    expect(passou(await pedirAoMiddleware(contas.gestor.token))).toBe(true)
    expect(passou(await pedirAoMiddleware(contas.gestorProfissional.token))).toBe(true)
  })

  it('o middleware devolve Cliente, Profissional, Colaborador e visitante', async () => {
    const cliente = await pedirAoMiddleware(contas.cliente.token)
    expect(passou(cliente)).toBe(false)
    expect(destino(cliente)).toBe('/cliente')

    for (const conta of ['profissional', 'colaborador'] as const) {
      const resposta = await pedirAoMiddleware(contas[conta].token)
      expect(passou(resposta), conta).toBe(false)
      expect(destino(resposta), conta).toBe('/admin')
    }

    const visitante = await pedirAoMiddleware(null)
    expect(passou(visitante)).toBe(false)
    expect(destino(visitante)).toBe('/')

    const tokenInventado = await pedirAoMiddleware('token-que-nao-existe')
    expect(passou(tokenInventado)).toBe(false)
    expect(destino(tokenInventado)).toBe('/')
  })

  it('a guarda de servidor da página repete a conferência', async () => {
    expect(await guardaDaPagina(contas.gestor.token)).toBe('liberada')
    expect(await guardaDaPagina(contas.gestorProfissional.token)).toBe('liberada')
    for (const conta of ['cliente', 'profissional', 'colaborador'] as const) {
      expect(await guardaDaPagina(contas[conta].token), conta).toBe('redirecionada')
    }
    expect(await guardaDaPagina(null)).toBe('redirecionada')
  })
})

/** Todo o texto do manual, normalizado para comparação. */
const TEXTO_DO_MANUAL = normalizarTexto(
  CAPITULOS_MANUAL.flatMap((c) => [c.titulo, c.resumo, ...c.blocos.map(textoDoBloco)]).join(' '),
)

describe('Manual da Vincis — conteúdo', () => {
  it('tem o título pedido e os capítulos na ordem de leitura', () => {
    expect(TITULO_MANUAL).toBe('Manual da Vincis — Treinamento, Testes e Suporte')
    expect(CAPITULOS_MANUAL.map((c) => c.titulo)).toEqual([
      'Comece por aqui',
      'O que é a Vincis',
      'Objetivo da plataforma',
      'Mapa da plataforma',
      'Quem são os usuários',
      'Site público',
      'Cliente',
      'Profissional',
      'Equipes e colaboradores',
      'Oportunidades e orçamentos',
      'Propostas e contrapropostas',
      'Consultorias',
      'Atendimentos',
      'Agenda',
      'Avaliações',
      'Precificação',
      'Parceiros',
      'Gestão Vincis',
      'Notificações',
      'Pagamentos',
      'Como testar a plataforma',
      'Como atender um usuário',
      'Problemas e limitações conhecidas',
      'Funcionalidades ainda em desenvolvimento',
      'Dúvidas comuns',
      'Glossário',
    ])
    const ids = CAPITULOS_MANUAL.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('explica logo no início para que o manual serve', () => {
    for (const objetivo of [
      'Aprender como a Vincis funciona',
      'Aprender como cada tipo de usuário usa a plataforma',
      'Testar as funcionalidades',
      'Identificar quando algo está funcionando incorretamente',
      'Ajudar usuários que tiverem dúvidas ou problemas',
    ]) {
      expect(TEXTO_DO_MANUAL, objetivo).toContain(normalizarTexto(objetivo))
    }
  })

  it('usa as quatro situações com o emoji combinado', () => {
    expect(SITUACAO.pronto.emoji).toBe('🟢')
    expect(SITUACAO.parcial.emoji).toBe('🟡')
    expect(SITUACAO.simulado.emoji).toBe('🔵')
    expect(SITUACAO.visual.emoji).toBe('⚪')
  })

  it('preserva o conteúdo do Guia do Gestor Vincis', () => {
    // Um trecho característico de cada seção do guia original (1 a 21 e A a E).
    const trechos = [
      'Hoje existem **cinco caminhos**',
      'referência que começa com SIM-',
      'É uma permissão somada à conta, não um tipo à parte',
      'Administrador** — faz tudo que o proprietário faz, menos transferir a propriedade',
      'Quem presta serviço não contrata como Cliente',
      'Busca real de prestadores aprovados',
      'vitrine de demonstração com conteúdo de exemplo',
      'Sobre nós, Blog, Carreiras, Contato, Termos de uso, Privacidade',
      'E-mail ou WhatsApp já usados bloqueiam o cadastro',
      'O link vale 24 horas e só pode ser usado uma vez',
      'Confirmar pelo WhatsApp **não** marca o e-mail como confirmado',
      'O login dura 24 horas',
      'O link vale 60 minutos; só o último link pedido funciona',
      'Trocar a senha desconecta a conta de todos os aparelhos',
      'login com Google/redes sociais, verificação em duas etapas',
      'O Gestor não consegue aprovar um cadastro com endereço ou experiência faltando',
      'O Profissional **não recebe e-mail nem notificação** da decisão',
      'O Colaborador recebe pedidos de orçamento conforme as **palavras que escreveu**',
      '“O que precisa de mim agora”',
      'Lista de chamados com o número “3” fixo no menu',
      'notificações de exemplo que nunca somem',
      'Ele **não cria nada**',
      'O convidado aceita ou recusa na própria tela de Equipe. O convite vale 14 dias',
      '**Colaborador externo** (convite de colaboração aceito): só visualiza e não repassa',
      'padrão 48 h, de 1 a 720 h',
      'Não é possível excluir a própria conta, contas de Gestor, nem contas ligadas a escritório',
      '**Clientes não veem comunicados em lugar nenhum**',
      'É **somente consulta**',
      'Arredondamento do preço final e número inicial de funcionários existem como parâmetros',
      '“Marcar como pago” só registra',
      'Descreve a necessidade (até 2.000 caracteres)',
      'O limite de 5 anexos é provisório',
      'O Cliente **não consegue cancelar** um pedido depois de enviado',
      'Escreve a mensagem da proposta (obrigatória, até 500 caracteres)',
      'O concorrente perde acesso ao pedido e aos anexos',
      'Se o acordo ficou “a combinar”, digita o valor (regra provisória)',
      'Existe na plataforma, mas hoje nenhuma ação leva a ela',
      'Cadastra até 5 serviços',
      '**Não há etapa de pagamento**, nem simulada',
      'Mudar a agenda **nunca desmarca** consultas já agendadas',
      'O horário fica **reservado por até 10 minutos**',
      'Cliente: até **2 horas antes**',
      'libera **10 minutos antes** do início e fica disponível até **15 minutos depois**',
      'programada para rodar **uma vez por dia**',
      'Recusado** / **Cancelado',
      'O quadro carrega os 200 Atendimentos mais recentes',
      'não existe assinatura digital de documentos na plataforma',
      '**Interno** (só equipe; o Cliente não vê nem sabe que existe)',
      'Adicionar, marcar, desmarcar, renomear, remover e reordenar etapas (até 40)',
      'O convite vale 7 dias',
      'Escolhe arquivos já anexados como entrega final (até 20)',
      'Nota de 1 a 5 estrelas e comentário opcional até 1.000 caracteres',
      'justificativa de pelo menos 10 caracteres',
      'Contabilidade Padrão · Contabilidade Consultiva · Assistência Jurídica · Pacote Empresarial Completo',
      'O Jurídico não cobra notas nem faturamento',
      '“Contratação registrada. O pagamento ainda não está disponível neste ambiente.”',
      'Sem tabela publicada, a página de planos do Profissional mostra',
      'Tela para o Cliente ver, pagar ou cancelar a assinatura',
      'Quem clica é lembrado naquele navegador por 90 dias',
      '**10% fixo** sobre **serviços do perfil contratados**',
      'o bloco “método de recebimento” (ex.: “PIX · CPF ****4821”)',
      'Cupons · Materiais · Campanhas · Ranking · Comunidade · Academia',
      'Nenhum deles usa WhatsApp ou SMS',
      'Só dois: confirmação de conta e recuperação de senha',
      'Ninguém é avisado da própria ação',
      'Estorno, reembolso, divisão de valores com o prestador, repasse, nota fiscal, cartão, PIX, boleto',
      'Endereço precisa ser digitado à mão',
      'Tudo funciona, mas só atualiza ao recarregar a página',
      'Só o dono',
      'Pagamento de acordo de orçamento · Pagamento de consultoria',
      'Tentar abrir áreas sem permissão digitando o endereço',
      'Rotina automática com frequência maior (para lembretes de 1 h e 10 min)',
      '**Parceiro contesta indicação:**',
      '**“Aguardando assinatura”** não envolve assinatura digital na plataforma',
      'Comissão avulsa / recorrente',
    ]
    for (const trecho of trechos) {
      expect(TEXTO_DO_MANUAL, trecho).toContain(normalizarTexto(trecho))
    }
    // O glossário do guia tinha 38 termos, e todos continuam aqui.
    const glossario = CAPITULOS_MANUAL.find((c) => c.id === 'glossario')
    const bloco = glossario?.blocos.find((b) => b.tipo === 'glossario')
    expect(bloco && bloco.tipo === 'glossario' ? bloco.termos.length : 0).toBe(38)
  })

  it('destaca as limitações importantes em avisos', () => {
    const avisos = CAPITULOS_MANUAL.flatMap((c) => c.blocos).filter(
      (b): b is Extract<typeof b, { tipo: 'aviso' }> => b.tipo === 'aviso',
    )
    const titulos = avisos.filter((a) => a.nivel === 'critico').map((a) => a.titulo)
    for (const titulo of [
      'Pagamentos ainda não são reais',
      'Telas e informações com dados fictícios',
      'Funcionalidades apenas visuais',
      'Notificações diferentes para Cliente e Profissional',
      'Profissional sem aviso de aprovação ou recusa',
      'Frequência dos lembretes de consultoria',
      'A página pública de Suporte tem informações incorretas',
    ]) {
      expect(titulos, titulo).toContain(titulo)
    }
  })

  it('não expõe detalhes técnicos, segredos nem fornecedores internos', () => {
    for (const proibido of [
      'process.env',
      'database_url',
      'cron_secret',
      'api_key',
      'secret',
      'token',
      'senha:',
      'drizzle',
      'postgres',
      'vercel',
      'pusher',
      'resend',
      'daily',
      'next.js',
      'server action',
      'middleware',
      'localstorage',
    ]) {
      expect(TEXTO_DO_MANUAL, proibido).not.toContain(proibido)
    }
  })
})

describe('Manual da Vincis — busca', () => {
  it('ignora acentos e maiúsculas', () => {
    const resultado = buscarNoManual(CAPITULOS_MANUAL, 'COMISSAO recorrente')
    expect(resultado.map((r) => r.capitulo.id)).toContain('parceiros')
  })

  it('traz o capítulo inteiro quando o título atende à busca', () => {
    const [primeiro] = buscarNoManual(CAPITULOS_MANUAL, 'glossário')
    expect(primeiro.capitulo.id).toBe('glossario')
    expect(primeiro.blocos).toHaveLength(primeiro.capitulo.blocos.length)
  })

  it('sem termo, mostra o manual inteiro; termo inexistente não encontra nada', () => {
    expect(buscarNoManual(CAPITULOS_MANUAL, '  ')).toHaveLength(CAPITULOS_MANUAL.length)
    expect(buscarNoManual(CAPITULOS_MANUAL, 'palavraquenaoexiste')).toEqual([])
  })
})
