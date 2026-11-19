import { eq, type SQL } from 'drizzle-orm'
import { usuarios } from '@/db/schema'

/**
 * Versão SQL da identidade pública. `pessoal` é quem se apresenta pelo
 * cadastro profissional — o único tipo que entra na vitrine de profissionais.
 * A equipe Vincis fica fora dela sem perder nenhuma permissão.
 */
export function condicaoIdentidadePessoal(): SQL {
  return eq(usuarios.identidadePublica, 'pessoal')
}

export function condicaoIdentidadeEquipeVincis(): SQL {
  return eq(usuarios.identidadePublica, 'equipe_vincis')
}
