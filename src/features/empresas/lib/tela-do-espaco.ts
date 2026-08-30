import type { EstadoContextoEmpresa } from '../types'

/**
 * O que a área administrativa mostra enquanto o espaço de trabalho é montado.
 *
 * ## Por que isto é uma função pura, e não um `if` dentro do provider
 *
 * Porque foi ali que nasceu um travamento: o `EmpresaProvider` esperava pelo
 * contexto de empresa de **todo mundo**, mas pulava a busca desse contexto
 * para o Gestor da Plataforma — a tela ficava aguardando um resultado que
 * ninguém tinha pedido, e "Preparando seu espaço de trabalho..." não terminava
 * nunca.
 *
 * A pulada foi embora junto com a premissa que a justificava: o Gestor é um
 * usuário completo, pode ter escritório e carrega contexto como qualquer
 * outro. Quem não tem escritório — Colaborador, ou Gestor ainda sem cadastro
 * de prestador — recebe um **estado final** vindo do servidor, e não uma
 * espera.
 *
 * A regra saiu de dentro da renderização para poder ser lida, testada e
 * conferida caso a caso. E ela tem uma invariante que o código anterior não
 * conseguia enunciar: **`carregando` só existe enquanto alguma coisa está
 * efetivamente a caminho.** Todo estado sem nada a caminho é terminal — a tela
 * pronta, o onboarding, ou o cartão de erro com "Tentar novamente".
 */
export type TelaDoEspaco = 'pronto' | 'carregando' | 'onboarding' | 'erro'

export type SituacaoDoEspaco = {
  /** A pessoa está numa rota de `/admin`. Fora dela nada é bloqueado. */
  naAreaAdministrativa: boolean
  /** A sessão ainda está sendo lida no navegador. */
  autenticacaoCarregando: boolean
  autenticado: boolean
  /** Uma consulta de contexto está em andamento agora. */
  contextoCarregando: boolean
  /** O contexto em memória corresponde à sessão atual. */
  contextoAtualizado: boolean
  perfilProfissional: boolean
  estadoContexto: EstadoContextoEmpresa
}

/** Estados em que a pessoa opera o painel sem nenhuma pendência de espaço. */
const ESTADOS_OPERACIONAIS: EstadoContextoEmpresa[] = [
  'ativo',
  'perfil_profissional',
  'colaborador',
  'gestor_plataforma',
]

export function telaDoEspaco(situacao: SituacaoDoEspaco): TelaDoEspaco {
  // Fora do painel o provider é só um provedor de dados; ele nunca substitui
  // a página pública por uma tela de espera.
  if (!situacao.naAreaAdministrativa) return 'pronto'

  // A leitura da sessão tem fim garantido no `AuthProvider`, então esperar por
  // ela é esperar por algo que chega.
  if (situacao.autenticacaoCarregando) return 'carregando'

  // Sem sessão quem decide é a moldura do painel, que redireciona. Bloquear
  // aqui só trocaria um redirecionamento por uma tela parada.
  if (!situacao.autenticado) return 'pronto'

  if (situacao.contextoCarregando || !situacao.contextoAtualizado) {
    return 'carregando'
  }

  if (ESTADOS_OPERACIONAIS.includes(situacao.estadoContexto)) return 'pronto'

  // Falta escritório. Quem pode abrir um vai para o onboarding; para o
  // Profissional, cujo escritório é criado pelo servidor antes da página
  // renderizar, chegar aqui significa que a criação não aconteceu — e isso é
  // um erro com botão de tentar de novo, não uma espera sem fim.
  if (situacao.estadoContexto === 'sem_tenant') {
    return situacao.perfilProfissional ? 'erro' : 'onboarding'
  }

  return 'erro'
}
