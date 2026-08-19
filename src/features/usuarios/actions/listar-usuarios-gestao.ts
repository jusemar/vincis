"use server";

import { BuscaUsuariosGestaoSchema } from "../schemas/gestao-usuarios";
import { validarGestorVincis } from "../lib/validar-gestor-vincis";
import { listarUsuariosGestaoQuery } from "../queries/listar-usuarios-gestao";
import type { ResultadoListaUsuarios } from "../types/gestao-usuarios";

export async function listarUsuariosGestao(
  entrada: unknown,
): Promise<ResultadoListaUsuarios> {
  const gestor = await validarGestorVincis();
  if (!gestor)
    return {
      sucesso: false,
      mensagem: "Acesso não autorizado.",
      usuarios: [],
      total: 0,
      pagina: 1,
      totalPaginas: 1,
    };

  const validacao = BuscaUsuariosGestaoSchema.safeParse(entrada);
  if (!validacao.success)
    return {
      sucesso: false,
      mensagem: "Busca inválida.",
      usuarios: [],
      total: 0,
      pagina: 1,
      totalPaginas: 1,
    };

  return {
    sucesso: true,
    mensagem: "Usuários carregados.",
    ...(await listarUsuariosGestaoQuery(gestor.id, validacao.data)),
  };
}
