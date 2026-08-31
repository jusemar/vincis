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
  /**
   * Aparece na barra lateral do painel.
   *
   * Só a Central Vincis aparece. Os cinco módulos da plataforma ocupavam cinco
   * linhas na barra de quem, no dia a dia, opera o próprio escritório — cinco
   * linhas para um assunto que não é o trabalho dele. Agora eles ficam um
   * nível abaixo, dentro da Central.
   */
  noMenuPrincipal: boolean
  /** É um módulo da Central Vincis, na navegação secundária dela. */
  naCentral: boolean
  /** Nome do módulo dentro da Central, quando difere do nome no menu. */
  rotuloNaCentral?: string
}

export const RECURSOS_ADMIN: readonly RecursoAdmin[] = [
  {
    // A porta única da plataforma na barra lateral, e ao mesmo tempo a Visão
    // geral de dentro da Central. É a mesma tela: entrar na Central é chegar
    // nela.
    id: 'central',
    rota: '/admin/central',
    rotulo: 'Central Vincis',
    rotuloNaCentral: 'Visão geral',
    exclusivoDoGestor: true,
    noMenuPrincipal: true,
    naCentral: true,
  },
  {
    id: 'usuarios',
    rota: '/admin/usuarios',
    rotulo: 'Usuários',
    exclusivoDoGestor: true,
    noMenuPrincipal: false,
    naCentral: true,
  },
  {
    id: 'comunicados',
    rota: '/admin/comunicados',
    rotulo: 'Comunicados',
    exclusivoDoGestor: true,
    noMenuPrincipal: false,
    naCentral: true,
  },
  {
    id: 'consultorias',
    rota: '/admin/consultorias',
    rotulo: 'Consultorias',
    exclusivoDoGestor: true,
    noMenuPrincipal: false,
    naCentral: true,
  },
  {
    id: 'precificacao',
    rota: '/admin/precificacao',
    rotulo: 'Precificação',
    exclusivoDoGestor: true,
    noMenuPrincipal: false,
    naCentral: true,
  },
]

/** Raiz da Central Vincis — a área global de gestão da plataforma. */
export const ROTA_CENTRAL = '/admin/central'

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
 * Itens da barra lateral do painel.
 *
 * Menu de desktop e menu mobile chamam esta função — é o que impede um item de
 * sumir num e continuar aparecendo no outro. Hoje ela devolve, no máximo, a
 * Central Vincis: os módulos da plataforma vivem dentro dela.
 */
export function recursosPermitidos({
  ehGestor,
}: {
  ehGestor: boolean
}): RecursoAdmin[] {
  return RECURSOS_ADMIN.filter(
    (recurso) =>
      recurso.noMenuPrincipal && (ehGestor || !recurso.exclusivoDoGestor),
  )
}

/**
 * Módulos da Central Vincis, na ordem da navegação secundária.
 *
 * A mesma lista que protege as rotas alimenta o menu de dentro da Central —
 * não existe uma segunda relação de módulos escrita à mão em componente
 * nenhum.
 */
export function modulosDaCentral(): (RecursoAdmin & { rotuloCurto: string })[] {
  return RECURSOS_ADMIN.filter((recurso) => recurso.naCentral).map(
    (recurso) => ({
      ...recurso,
      rotuloCurto: recurso.rotuloNaCentral ?? recurso.rotulo,
    }),
  )
}
