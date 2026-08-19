/**
 * Matriz de ações sobre o cliente, sem nenhuma dependência de banco.
 *
 * Fica separada de `acesso-cliente.ts` (que monta condições Drizzle) pelo mesmo
 * motivo que `tipos-pessoa.ts` é separado de `prestador.ts`: os componentes de
 * `use client` precisam decidir o que renderizar com exatamente a mesma tabela
 * que o servidor usa para autorizar, sem arrastar o schema para o navegador.
 */

/**
 * Níveis de acesso a um cliente, do mais forte para o mais fraco.
 *
 * Os três primeiros são acessos internos (proprietário do cliente ou membro do
 * escritório). `colaborador_externo` é o acesso pontual concedido por um convite
 * de colaboração aceito — não cria vínculo com o escritório e é revogável.
 */
export type NivelAcessoCliente =
  | 'proprietario'
  | 'escritorio_admin'
  | 'atribuido'
  | 'colaborador_externo'

export const NIVEIS_INTERNOS: NivelAcessoCliente[] = [
  'proprietario',
  'escritorio_admin',
  'atribuido',
]

export function ehAcessoInterno(nivel: NivelAcessoCliente) {
  return NIVEIS_INTERNOS.includes(nivel)
}

export type PermissoesCliente = {
  visualizar: boolean
  editar: boolean
  arquivar: boolean
  restaurar: boolean
  /** Enviar convite de colaboração externa neste cliente. */
  compartilhar: boolean
  /** Atribuir o cliente a outro membro do escritório. */
  atribuir: boolean
}

export const SEM_PERMISSAO_CLIENTE: PermissoesCliente = {
  visualizar: false,
  editar: false,
  arquivar: false,
  restaurar: false,
  compartilhar: false,
  atribuir: false,
}

/**
 * A regra única. Ler a tabela deixa evidentes as duas fronteiras que importam:
 * arquivar/restaurar são atos administrativos (proprietário do cliente ou de
 * quem administra o escritório), e colaboração externa é somente leitura.
 */
export const PERMISSOES_POR_NIVEL: Record<
  NivelAcessoCliente,
  PermissoesCliente
> = {
  proprietario: {
    visualizar: true,
    editar: true,
    arquivar: true,
    restaurar: true,
    compartilhar: true,
    // Atribuição é ato administrativo do escritório, não do dono do cliente.
    atribuir: false,
  },
  escritorio_admin: {
    visualizar: true,
    editar: true,
    arquivar: true,
    restaurar: true,
    compartilhar: true,
    atribuir: true,
  },
  atribuido: {
    visualizar: true,
    // Dados operacionais do cliente atribuído: pode trabalhar nele.
    editar: true,
    // Arquivar tira o cliente da operação de todo o escritório — é decisão
    // administrativa, não de quem apenas recebeu a atribuição.
    arquivar: false,
    restaurar: false,
    compartilhar: true,
    atribuir: false,
  },
  colaborador_externo: {
    visualizar: true,
    editar: false,
    arquivar: false,
    restaurar: false,
    // Não repassa acesso adiante.
    compartilhar: false,
    atribuir: false,
  },
}

/** Permissões de um nível de acesso. Sem nível, nenhuma permissão. */
export function permissoesDoNivel(
  nivel: NivelAcessoCliente | null,
): PermissoesCliente {
  return nivel ? PERMISSOES_POR_NIVEL[nivel] : SEM_PERMISSAO_CLIENTE
}
