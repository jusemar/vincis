/**
 * Registro dos recursos da área administrativa que são rotas próprias.
 *
 * É a fonte única de duas respostas que precisavam concordar e viviam em
 * lugares separados: "esta rota exige Gestor da Plataforma?" (middleware e
 * guarda de servidor) e "este item aparece no menu?" (barra lateral e navegação
 * mobile). Antes, a primeira era uma lista escrita à mão dentro do middleware e
 * a segunda era deduzida da URL aberta — duas regras para o mesmo fato.
 *
 * Marcar um recurso novo como exclusivo do Gestor é acrescentar uma linha aqui:
 * a rota passa a ser barrada no middleware, o item some do menu de quem não é
 * Gestor e a guarda de servidor continua valendo. Foi assim que
 * `/admin/precificacao` entrou — `exclusivoDoGestor: true`, e nada mais.
 *
 * O módulo é puro (sem React, sem banco, sem ícones) porque o middleware o
 * importa. Ícone e rótulo curto de menu ficam com quem desenha.
 *
 * Não inclui as telas do painel do prestador: aquelas não são rotas, são
 * seções de `/admin?pagina=...` resolvidas no cliente, e seguem governadas
 * pelas regras que já tinham.
 */
export type RecursoAdmin = {
  /** Identificador estável, usado pelo menu para escolher o ícone. */
  id: string
  rota: string
  rotulo: string
  /**
   * Só o Gestor da Plataforma acessa. Vale para rota, menu e guarda de
   * servidor — os três leem esta mesma marca.
   */
  exclusivoDoGestor: boolean
}

export const RECURSOS_ADMIN: readonly RecursoAdmin[] = [
  {
    // A casa do grupo. Existe porque a Gestão da Plataforma deixou de ser a
    // experiência principal do Gestor: ele entra no painel do próprio
    // escritório, e os assuntos da plataforma — cadastros pendentes, prazo das
    // oportunidades — precisam de um lugar próprio para continuarem
    // alcançáveis.
    id: 'plataforma',
    rota: '/admin/plataforma',
    rotulo: 'Visão geral',
    exclusivoDoGestor: true,
  },
  {
    id: 'usuarios',
    rota: '/admin/usuarios',
    rotulo: 'Usuários',
    exclusivoDoGestor: true,
  },
  {
    id: 'comunicados',
    rota: '/admin/comunicados',
    rotulo: 'Comunicados',
    exclusivoDoGestor: true,
  },
  {
    id: 'consultorias',
    rota: '/admin/consultorias',
    rotulo: 'Consultorias',
    exclusivoDoGestor: true,
  },
  {
    id: 'precificacao',
    rota: '/admin/precificacao',
    rotulo: 'Precificação',
    exclusivoDoGestor: true,
  },
]

/** Raiz da área administrativa — destino de quem é barrado num recurso dela. */
export const ROTA_ADMIN = '/admin'

/**
 * Recurso a que um caminho pertence.
 *
 * Compara pela rota e pelos filhos dela (`/admin/usuarios/<id>` é o recurso
 * `usuarios`), nunca por `startsWith` cru — sem isso, uma futura
 * `/admin/usuarios-teste` herdaria a proteção de outro recurso por acidente.
 */
export function recursoDaRota(caminho: string): RecursoAdmin | null {
  return (
    RECURSOS_ADMIN.find(
      ({ rota }) => caminho === rota || caminho.startsWith(`${rota}/`),
    ) ?? null
  )
}

/** A rota pedida é de um recurso exclusivo do Gestor da Plataforma? */
export function rotaExigeGestor(caminho: string): boolean {
  return recursoDaRota(caminho)?.exclusivoDoGestor ?? false
}

/**
 * Recursos que a pessoa pode ver e abrir.
 *
 * Menu de desktop e menu mobile chamam esta função — é o que impede um item de
 * sumir num e continuar aparecendo no outro.
 */
export function recursosPermitidos({
  ehGestor,
}: {
  ehGestor: boolean
}): RecursoAdmin[] {
  return RECURSOS_ADMIN.filter(
    (recurso) => ehGestor || !recurso.exclusivoDoGestor,
  )
}
