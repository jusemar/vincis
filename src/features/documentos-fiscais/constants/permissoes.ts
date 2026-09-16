/**
 * Permissões da Central Fiscal no RBAC da plataforma (`permissoes` +
 * `perfis_permissoes`), no mesmo formato `dominio.acao` das demais.
 *
 * Arquivo puro: a interface decide o que mostrar com a mesma lista que o
 * servidor usa para autorizar.
 *
 * ## Duas camadas, sempre juntas
 *
 * A permissão diz o que **um tipo de conta** pode fazer com documento fiscal.
 * Ela não diz **onde**: isso vem do vínculo ativo com o escritório e do acesso
 * ao cliente (`lib/acesso-documentos-fiscais`). Ter a permissão sem vínculo não
 * abre documento nenhum — inclusive para o Gestor da Plataforma, que passa em
 * todas as permissões mas não é membro dos escritórios dos outros.
 */
export const PERMISSOES_DOCUMENTOS_FISCAIS = {
  visualizar: 'documentos_fiscais.visualizar',
  enviar: 'documentos_fiscais.enviar',
  revisar: 'documentos_fiscais.revisar',
  editar: 'documentos_fiscais.editar',
  baixar: 'documentos_fiscais.baixar',
  excluir: 'documentos_fiscais.excluir',
  integracoes: 'documentos_fiscais.integracoes',
} as const

export type PermissaoDocumentosFiscais =
  (typeof PERMISSOES_DOCUMENTOS_FISCAIS)[keyof typeof PERMISSOES_DOCUMENTOS_FISCAIS]

export const DESCRICOES_PERMISSOES_DOCUMENTOS_FISCAIS: Record<PermissaoDocumentosFiscais, string> = {
  'documentos_fiscais.visualizar': 'Visualizar documentos fiscais',
  'documentos_fiscais.enviar': 'Enviar documentos fiscais',
  'documentos_fiscais.revisar': 'Revisar documentos fiscais',
  'documentos_fiscais.editar': 'Editar dados de documentos fiscais',
  'documentos_fiscais.baixar': 'Baixar arquivos originais de documentos fiscais',
  'documentos_fiscais.excluir': 'Excluir documentos fiscais',
  'documentos_fiscais.integracoes': 'Gerenciar integrações fiscais',
}

/**
 * Atos administrativos do escritório: além da permissão, exigem que o vínculo
 * administre o escritório (Proprietário ou Administrador). Excluir tira
 * evidência fiscal da operação de todos; integração fala com terceiro em nome
 * do escritório.
 */
export const PERMISSOES_FISCAIS_ADMINISTRATIVAS: readonly PermissaoDocumentosFiscais[] = [
  PERMISSOES_DOCUMENTOS_FISCAIS.excluir,
  PERMISSOES_DOCUMENTOS_FISCAIS.integracoes,
]

const P = PERMISSOES_DOCUMENTOS_FISCAIS

/**
 * Quem recebe o quê. Fonte única para `src/db/seed.ts` e para a migration
 * `0066_documentos_fiscais` (o teste da fundação confere a migration contra
 * esta tabela).
 *
 * - `profissional` e `contador`: todas. Excluir e integrações continuam presos
 *   ao papel administrativo no escritório.
 * - `colaborador`: visualizar, enviar e baixar. Revisar e editar dado fiscal é
 *   ato técnico que fica com o Profissional — o mesmo corte que já existe em
 *   `contratos` e `documentos.editar`.
 * - `advogado`: nenhuma. Documento fiscal não é do domínio jurídico.
 * - `cliente`: nenhuma nesta fase. O Cliente não é membro de escritório, e o
 *   escopo pelo qual ele veria os próprios documentos ainda não existe;
 *   conceder a permissão antes do escopo seria abrir a porta sem fechadura.
 * - `gestor_vincis`: nenhum vínculo gravado — `possuiPermissao` já o aprova.
 */
export const PERMISSOES_FISCAIS_POR_PERFIL: Record<string, readonly PermissaoDocumentosFiscais[]> = {
  profissional: [P.visualizar, P.enviar, P.revisar, P.editar, P.baixar, P.excluir, P.integracoes],
  contador: [P.visualizar, P.enviar, P.revisar, P.editar, P.baixar, P.excluir, P.integracoes],
  colaborador: [P.visualizar, P.enviar, P.baixar],
}
