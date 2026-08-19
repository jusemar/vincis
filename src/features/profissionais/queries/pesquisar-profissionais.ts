import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/connection";
import { perfisProfissionais, usuarios } from "@/db/schema";
import { condicaoContaVerificada } from "@/features/usuarios/lib/condicao-verificacao";
import {
  condicaoPrestadorHabilitado,
  condicaoPrestadorHabilitadoDoTipo,
} from "@/features/usuarios/lib/prestador";
import {
  PesquisaProfissionaisSchema,
  type PesquisaProfissionaisDTO,
} from "../schemas/pesquisa-profissionais";

export async function pesquisarProfissionaisReais(
  entrada: PesquisaProfissionaisDTO = {},
) {
  const filtros = PesquisaProfissionaisSchema.parse(entrada);
  const condicoes: SQL[] = [
    eq(usuarios.status, "ativo"),
    condicaoContaVerificada(),
    // Habilitação por tipo: profissional aprovado ou colaborador ativo.
    filtros.tipoPrestador === "todos"
      ? condicaoPrestadorHabilitado()
      : condicaoPrestadorHabilitadoDoTipo(filtros.tipoPrestador),
  ];
  if (filtros.busca) {
    const termo = `%${filtros.busca}%`;
    const busca = or(
      ilike(usuarios.nome, termo),
      ilike(perfisProfissionais.emailProfissional, termo),
      ilike(perfisProfissionais.apresentacao, termo),
      ilike(perfisProfissionais.formacao, termo),
      ilike(perfisProfissionais.cidade, termo),
      sql`${perfisProfissionais.areasAtuacao}::text ilike ${termo}`,
      sql`${perfisProfissionais.especialidades}::text ilike ${termo}`,
    );
    if (busca) condicoes.push(busca);
  }
  if (filtros.profissao !== "todos")
    condicoes.push(eq(perfisProfissionais.tipoProfissional, filtros.profissao));
  if (filtros.estado)
    condicoes.push(
      eq(perfisProfissionais.estado, filtros.estado.toUpperCase()),
    );
  if (filtros.cidade)
    condicoes.push(ilike(perfisProfissionais.cidade, `%${filtros.cidade}%`));
  if (filtros.formacao)
    condicoes.push(
      ilike(perfisProfissionais.formacao, `%${filtros.formacao}%`),
    );
  if (filtros.especialidade)
    condicoes.push(
      sql`${perfisProfissionais.especialidades}::text ilike ${`%${filtros.especialidade}%`}`,
    );
  if (filtros.modalidade !== "todos")
    condicoes.push(
      eq(perfisProfissionais.modalidadeAtuacao, filtros.modalidade),
    );
  if (filtros.experienciaMinima)
    condicoes.push(
      sql`${perfisProfissionais.tempoExperiencia} >= ${filtros.experienciaMinima}`,
    );
  const where = and(...condicoes);
  const [registros, [total]] = await Promise.all([
    db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        avatarUrl: perfisProfissionais.avatarUrl,
        // Tipo da pessoa (Profissional/Colaborador), distinto da categoria.
        tipoPrestador: perfisProfissionais.tipoPrestador,
        profissao: perfisProfissionais.tipoProfissional,
        areasAtuacao: perfisProfissionais.areasAtuacao,
        especialidades: perfisProfissionais.especialidades,
        certificacoes: perfisProfissionais.certificacoes,
        cidade: perfisProfissionais.cidade,
        estado: perfisProfissionais.estado,
        formacao: perfisProfissionais.formacao,
        instituicaoEnsino: perfisProfissionais.instituicaoEnsino,
        numeroRegistro: perfisProfissionais.numeroRegistro,
        experiencia: perfisProfissionais.tempoExperiencia,
        apresentacao: perfisProfissionais.apresentacao,
        modalidade: perfisProfissionais.modalidadeAtuacao,
        valorHoraCentavos: perfisProfissionais.valorHoraCentavos,
        avaliacaoMedia: perfisProfissionais.avaliacaoMedia,
        totalAvaliacoes: perfisProfissionais.totalAvaliacoes,
        disponivel: perfisProfissionais.disponivelAtendimento,
      })
      .from(perfisProfissionais)
      .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
      .where(where)
      .orderBy(desc(perfisProfissionais.createdAt))
      .limit(filtros.porPagina)
      .offset((filtros.pagina - 1) * filtros.porPagina),
    db
      .select({ valor: count() })
      .from(perfisProfissionais)
      .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
      .where(where),
  ]);
  return {
    profissionais: registros,
    total: total?.valor ?? 0,
    pagina: filtros.pagina,
    totalPaginas: Math.max(
      1,
      Math.ceil((total?.valor ?? 0) / filtros.porPagina),
    ),
  };
}
