import type { PerfilTipo } from '@/features/usuarios/types'
import type { AudienciaComunicado } from '../constants/comunicado'

/**
 * De que lado da plataforma a pessoa está.
 *
 * O perfil tem seis valores por razões históricas (`contador` e `advogado` são
 * nomes legados do catálogo), mas para o mural só existem dois lados: quem
 * presta serviço e quem contrata. O Gestor da Vincis é tratado como prestador
 * aqui apenas para efeito de leitura do mural — quem administra o conteúdo é
 * decidido na action, não nesta função.
 */
export function audienciaDoPerfil(perfil: PerfilTipo): AudienciaComunicado {
  return perfil === 'cliente' ? 'clientes' : 'prestadores'
}

/**
 * Audiências que essa pessoa recebe.
 *
 * `todos` sempre entra: é o comunicado dirigido à plataforma inteira. O par
 * ficou explícito numa função porque a consulta do mural e o teste precisam
 * concordar sobre o que "audiência" significa.
 */
export function audienciasVisiveis(
  perfil: PerfilTipo,
): AudienciaComunicado[] {
  return ['todos', audienciaDoPerfil(perfil)]
}
