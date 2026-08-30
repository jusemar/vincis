import { ehPessoaColaborador } from '@/features/usuarios/lib/prestador'
import { buscarCapacidadesUsuario } from '@/features/usuarios/queries/buscar-perfil-principal-usuario'
import { buscarEmpresasAtivasUsuario } from '../queries/buscar-empresas-usuario'
import { buscarContextoProfissionalIndividual } from '../queries/buscar-contexto-profissional-individual'
import { buscarVinculoAtivoEmpresa } from '../queries/buscar-vinculo-empresa'
import type { ResultadoContextoEmpresa } from '../types'

export async function resolverContextoTenant(
  usuarioId: string,
  empresaIdSolicitada?: string | null,
): Promise<ResultadoContextoEmpresa> {
  if (empresaIdSolicitada) {
    const contexto = await buscarVinculoAtivoEmpresa(
      usuarioId,
      empresaIdSolicitada,
    )
    if (contexto) {
      return {
        sucesso: true,
        estado: 'ativo',
        mensagem: 'Empresa ativa encontrada',
        contexto,
      }
    }
  }

  const empresasAtivas = await buscarEmpresasAtivasUsuario(usuarioId)

  if (empresasAtivas.length === 0) {
    const contextoProfissional =
      await buscarContextoProfissionalIndividual(usuarioId)
    if (contextoProfissional) {
      return {
        sucesso: true,
        estado: 'perfil_profissional',
        mensagem: 'Perfil profissional ativo encontrado',
        contextoProfissional,
      }
    }

    const { perfilOperacional, ehGestor } =
      await buscarCapacidadesUsuario(usuarioId)

    // O Colaborador não abre escritório: ficar sem tenant é o estado normal
    // dele. Sem este ramo, cairia no onboarding de empresa — que o servidor
    // recusaria, deixando a conta presa numa tela sem saída.
    if (ehPessoaColaborador(perfilOperacional)) {
      return {
        sucesso: true,
        estado: 'colaborador',
        mensagem: 'Colaborador sem vínculo de escritório',
      }
    }

    // Quem administra a plataforma e ainda não é prestador entra no painel
    // pela Gestão da Plataforma. Oferecer o onboarding de escritório aqui
    // seria oferecer uma porta que o servidor fecha: abrir escritório exige
    // cadastro de Profissional aprovado. Assim que esse cadastro existir, a
    // conta volta a cair no ramo normal e o onboarding aparece.
    if (ehGestor) {
      return {
        sucesso: true,
        estado: 'gestor_plataforma',
        mensagem: 'Gestor da Plataforma sem escritório próprio',
      }
    }

    return {
      sucesso: true,
      estado: 'sem_tenant',
      mensagem: 'Crie seu escritório para continuar',
    }
  }

  // Participar de mais de uma equipe é normal e não pode travar o painel.
  // Antes isto virava `selecao_necessaria` com `sucesso: false`, e como não
  // existe seletor de empresa na interface o usuário ficava num beco sem saída
  // ("Não foi possível abrir seu espaço"). Abrimos no vínculo mais antigo, que
  // é determinístico; a troca continua possível pelo cookie de contexto, que
  // `empresaIdSolicitada` já honra no início desta função.
  return {
    sucesso: true,
    estado: 'ativo',
    mensagem: 'Empresa ativa encontrada',
    contexto: empresasAtivas[0],
  }
}
