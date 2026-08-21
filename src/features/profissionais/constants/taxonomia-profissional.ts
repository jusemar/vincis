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
 * Especialidades por categoria.
 *
 * São as listas que a busca pública já usava, sem uma linha inventada. Ficam
 * como `readonly` porque são vocabulário fechado: o Cliente escolhe entre
 * estas, e o servidor recusa qualquer valor fora daqui.
 */
export const ESPECIALIDADES_POR_CATEGORIA: Record<
  CategoriaProfissional,
  readonly string[]
> = {
  contabilidade: [
    'Contabilidade Geral',
    'Fiscal',
    'Trabalhista',
    'Societário',
    'Auditoria',
    'Planejamento Tributário',
  ],
  advocacia: [
    'Direito Civil',
    'Direito Trabalhista',
    'Direito Tributário',
    'Direito Empresarial',
    'Direito Contratual',
    'Propriedade Intelectual',
  ],
  especialista_fiscal: [
    'RH e Departamento Pessoal',
    'TI e Sistemas',
    'Marketing Digital',
    'Gestão de Projetos',
    'Consultoria Financeira',
  ],
}

/** A especialidade pertence mesmo àquela categoria? */
export function especialidadeValida(
  categoria: CategoriaProfissional,
  especialidade: string,
): boolean {
  return ESPECIALIDADES_POR_CATEGORIA[categoria].includes(especialidade)
}

export { CATEGORIAS_PROFISSIONAIS }
