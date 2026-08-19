import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/connection";
import {
  empresaMembros,
  empresas,
  perfis,
  perfisProfissionais,
  usuarios,
  usuariosPerfis,
} from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { escolherPerfilPrincipal } from "../constants/perfis";
import type { BuscaUsuariosGestaoSchema } from "../schemas/gestao-usuarios";
import type { UsuarioGestao } from "../types/gestao-usuarios";
import type { z } from "zod";

type Filtros = z.output<typeof BuscaUsuariosGestaoSchema>;

/** Gestor que confirmou a identidade — a mesma tabela, em outro papel. */
const gestorVerificador = alias(usuarios, "gestor_verificador");

export async function listarUsuariosGestaoQuery(
  gestorId: string,
  filtros: Filtros = {
    busca: "",
    perfil: "todos",
    profissao: "todos",
    modalidade: "todos",
    status: "todos",
    statusProfissional: "todos",
    emailVerificado: "todos",
    verificacao: "todos",
    empresa: "",
    pagina: 1,
    porPagina: 10,
  },
): Promise<{
  usuarios: UsuarioGestao[];
  total: number;
  pagina: number;
  totalPaginas: number;
}> {
  const condicoes: SQL[] = [];
  // A Gestão precisa localizar uma conta pelos três identificadores que o
  // usuário informa ao pedir ajuda: nome, e-mail ou o próprio WhatsApp.
  if (filtros.busca)
    condicoes.push(
      or(
        ilike(usuarios.nome, `%${filtros.busca}%`),
        ilike(usuarios.email, `%${filtros.busca}%`),
        ilike(usuarios.whatsapp, `%${filtros.busca}%`),
      )!,
    );
  if (filtros.status !== "todos")
    condicoes.push(
      eq(
        usuarios.status,
        filtros.status as "ativo" | "bloqueado" | "pendente_email",
      ),
    );
  if (filtros.emailVerificado !== "todos")
    condicoes.push(
      eq(usuarios.emailVerificado, filtros.emailVerificado === "sim"),
    );
  // Filtro por método de verificação da identidade. `whatsapp` traz quem foi
  // liberado pela Gestão mas ainda não confirmou o e-mail — exatamente a fila
  // que o Gestor precisa acompanhar.
  if (filtros.verificacao === "nao_verificada")
    condicoes.push(
      and(
        eq(usuarios.emailVerificado, false),
        eq(usuarios.whatsappVerificado, false),
      )!,
    );
  if (filtros.verificacao === "email")
    condicoes.push(eq(usuarios.emailVerificado, true));
  if (filtros.verificacao === "whatsapp")
    condicoes.push(eq(usuarios.whatsappVerificado, true));
  if (filtros.profissao !== "todos")
    condicoes.push(eq(perfisProfissionais.tipoProfissional, filtros.profissao));
  if (filtros.modalidade !== "todos")
    condicoes.push(
      eq(perfisProfissionais.modalidadeAtuacao, filtros.modalidade),
    );
  if (filtros.statusProfissional !== "todos")
    condicoes.push(
      eq(perfisProfissionais.statusAnalise, filtros.statusProfissional),
    );
  if (filtros.perfil !== "todos")
    condicoes.push(
      sql`exists (select 1 from usuarios_perfis up join perfis p on p.id = up.perfil_id where up.usuario_id = ${usuarios.id} and p.nome = ${filtros.perfil})`,
    );
  if (filtros.empresa)
    condicoes.push(
      sql`exists (select 1 from empresa_membros em join empresas e on e.id = em.empresa_id where em.usuario_id = ${usuarios.id} and em.status = 'ativo' and e.nome ilike ${`%${filtros.empresa}%`})`,
    );
  const where = condicoes.length ? and(...condicoes) : undefined;
  const [{ valor: total = 0 }] = await db
    .select({ valor: count() })
    .from(usuarios)
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(where);
  const totalPaginas = Math.max(1, Math.ceil(total / filtros.porPagina));
  const pagina = Math.min(filtros.pagina, totalPaginas);
  const registros = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      status: usuarios.status,
      whatsapp: usuarios.whatsapp,
      emailVerificado: usuarios.emailVerificado,
      whatsappVerificado: usuarios.whatsappVerificado,
      whatsappVerificadoEm: usuarios.whatsappVerificadoEm,
      whatsappVerificadoPor: gestorVerificador.nome,
      criadoEm: usuarios.createdAt,
      ultimoLoginEm: usuarios.ultimoLoginEm,
      statusProfissional: perfisProfissionais.statusAnalise,
      // Tipo do prestador: separa Profissional de Colaborador na Gestão.
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      modalidadeAtuacao: perfisProfissionais.modalidadeAtuacao,
    })
    .from(usuarios)
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .leftJoin(
      gestorVerificador,
      eq(gestorVerificador.id, usuarios.whatsappVerificadoPorId),
    )
    .where(where)
    .orderBy(asc(usuarios.nome))
    .limit(filtros.porPagina)
    .offset((pagina - 1) * filtros.porPagina);
  const ids = registros.map((item) => item.id);
  const [perfisUsuarios, vinculos] = ids.length
    ? await Promise.all([
        db
          .select({ usuarioId: usuariosPerfis.usuarioId, nome: perfis.nome })
          .from(usuariosPerfis)
          .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
          .where(inArray(usuariosPerfis.usuarioId, ids)),
        db
          .select({
            usuarioId: empresaMembros.usuarioId,
            empresaNome: empresas.nome,
            funcao: empresaMembros.funcao,
            createdAt: empresaMembros.createdAt,
          })
          .from(empresaMembros)
          .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
          .where(
            and(
              inArray(empresaMembros.usuarioId, ids),
              eq(empresaMembros.status, "ativo"),
              eq(empresas.status, "ativo"),
            ),
          )
          .orderBy(asc(empresaMembros.createdAt)),
      ])
    : [[], []];
  return {
    usuarios: registros.map((usuario) => {
      const perfisDoUsuario = perfisUsuarios
        .filter((item) => item.usuarioId === usuario.id)
        .map((item) => item.nome);
      const vinculosDoUsuario = vinculos.filter(
        (item) => item.usuarioId === usuario.id,
      );
      // Mesma prioridade usada no login e no roteamento, para a Gestão não
      // mostrar um perfil diferente daquele que de fato governa o acesso.
      const perfil = escolherPerfilPrincipal(perfisDoUsuario);
      const vinculoPrincipal = vinculosDoUsuario[0];
      return {
        ...usuario,
        perfil: perfil as UsuarioGestao["perfil"],
        criadoEm: usuario.criadoEm.toISOString(),
        whatsappVerificadoEm:
          usuario.whatsappVerificadoEm?.toISOString() ?? null,
        ultimoLoginEm: usuario.ultimoLoginEm?.toISOString() ?? null,
        proprioGestor: usuario.id === gestorId,
        // O vínculo ativo é a verdade sobre o escritório. Antes isto era
        // anulado quando o cadastro dizia "individual", escondendo o
        // escritório de quem atua sozinho mas entrou para uma equipe.
        empresaNome: vinculoPrincipal?.empresaNome ?? null,
        funcaoEmpresa: vinculoPrincipal?.funcao ?? null,
        totalVinculosAtivos: vinculosDoUsuario.length,
      };
    }),
    total,
    pagina,
    totalPaginas,
  };
}
