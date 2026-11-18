import { CATEGORIAS_PROFISSIONAIS } from '@/features/usuarios/schemas/perfil-profissional'

/**
 * Taxonomia profissional da plataforma, num lugar só.
 *
 * As **categorias** são as mesmas de `perfis_profissionais.tipo_profissional`,
 * declaradas no cadastro do prestador — não existe outra lista, e nada deve
 * inventar uma. As **especialidades** são exatamente as que a busca pública de
 * `/profissionais` já oferece; elas moravam soltas dentro do `FilterBar`, e
 * foram trazidas para cá porque agora dois lugares dependem delas (a busca e a
 * solicitação de orçamento). Duas cópias divergiriam no primeiro ajuste.
 *
 * Os rótulos são os mesmos que o cadastro do prestador exibe, para que Cliente
 * e prestador leiam a categoria com o mesmo nome.
 */

export type CategoriaProfissional = (typeof CATEGORIAS_PROFISSIONAIS)[number]

export const ROTULO_CATEGORIA_PROFISSIONAL: Record<
  CategoriaProfissional,
  string
> = {
  contabilidade: 'Contabilidade — Contador',
  especialista_fiscal: 'Contabilidade — Especialista Fiscal',
  advocacia: 'Jurídico — Advogado',
}

/**
 * Catálogo central de especialidades, por **categoria pública**.
 *
 * É a única lista: a busca de `/profissionais`, o orçamento geral, o orçamento
 * privado e a validação do servidor leem daqui. São opções que o Cliente pode
 * escolher para refinar o pedido dentro da categoria — **não** são atribuídas
 * aos perfis, não criam serviço e não indicam qualificação de ninguém.
 *
 * As chaves são as categorias públicas (as mesmas gravadas em
 * `oportunidades.categoria`). `assistente_contabil` é o Assistente Contábil:
 * colaborador com perfil na vitrine pública, sem habilitação regulamentada.
 */
export const CATEGORIAS_PUBLICAS = ['contabilidade', 'advocacia', 'assistente_contabil'] as const
export type CategoriaPublica = (typeof CATEGORIAS_PUBLICAS)[number]

export const CATALOGO_ESPECIALIDADES: Record<CategoriaPublica, readonly string[]> = {
  contabilidade: [
    'Contabilidade geral',
    'MEI',
    'Abertura de empresa',
    'Alteração e baixa de empresa',
    'Regularização de CNPJ',
    'Simples Nacional',
    'Lucro Presumido',
    'Lucro Real',
    'Escrituração contábil',
    'Obrigações fiscais',
    'Folha de pagamento',
    'Departamento pessoal',
    'eSocial',
    'Imposto de Renda Pessoa Física',
    'Planejamento tributário',
    'Contabilidade consultiva',
    'Contabilidade para comércio e e-commerce',
    'Contabilidade para prestadores de serviços',
    'Contabilidade para profissionais da saúde',
    'Auditoria contábil',
    'Perícia contábil',
  ],
  advocacia: [
    'Direito civil',
    'Direito do consumidor',
    'Direito trabalhista',
    'Direito de família',
    'Inventário e sucessões',
    'Direito previdenciário',
    'Contratos',
    'Direito empresarial',
    'Direito tributário',
    'Direito imobiliário',
    'Direito criminal',
    'Direito bancário',
    'Direito digital',
    'Proteção de dados e LGPD',
    'Direito administrativo',
    'Direito de trânsito',
  ],
  assistente_contabil: [
    'Organização de documentos',
    'Rotinas administrativas',
    'Contas a pagar',
    'Contas a receber',
    'Controle operacional de caixa',
    'Planilhas financeiras',
    'Conferência de recebimentos',
    'Faturamento',
    'Apoio operacional à emissão de notas',
    'Cadastro de clientes e fornecedores',
    'Organização de documentos admissionais',
    'Organização de informações para a folha',
    'Controle administrativo de férias',
    'Organização de comprovantes para IRPF',
    'Apoio ao preenchimento de IRPF simples',
  ],
}

/**
 * Especialidades por **tipo interno** do cadastro — derivadas do catálogo, sem
 * lista própria. O especialista fiscal é profissional de Contabilidade
 * ("Contabilidade — Especialista Fiscal") e usa o catálogo contábil.
 */
export const ESPECIALIDADES_POR_CATEGORIA: Record<
  CategoriaProfissional,
  readonly string[]
> = {
  contabilidade: CATALOGO_ESPECIALIDADES.contabilidade,
  especialista_fiscal: CATALOGO_ESPECIALIDADES.contabilidade,
  advocacia: CATALOGO_ESPECIALIDADES.advocacia,
}

/** A especialidade pertence mesmo àquela categoria? */
export function especialidadeValida(
  categoria: CategoriaProfissional,
  especialidade: string,
): boolean {
  return ESPECIALIDADES_POR_CATEGORIA[categoria].includes(especialidade)
}

export { CATEGORIAS_PROFISSIONAIS }
