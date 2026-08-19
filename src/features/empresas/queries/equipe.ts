import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db/connection";
import { pesquisarProfissionaisReais } from "@/features/profissionais/queries/pesquisar-profissionais";
import {
  papelDoVinculo,
  permissoesEscritorio,
  type VinculoEscritorio,
} from "../lib/papeis-escritorio";
import {
  convitesEmpresa,
  clienteAtribuicoes,
  clientes,
  empresaMembros,
  empresas,
  perfisProfissionais,
  usuarios,
} from "@/db/schema";

export async function obterVinculoAtivo(usuarioId: string, empresaId: string) {
  const [vinculo] = await db
    .select({
      id: empresaMembros.id,
      empresaId: empresas.id,
      empresaNome: empresas.nome,
      funcao: empresaMembros.funcao,
      empresaLegadaId: usuarios.empresaId,
    })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .innerJoin(usuarios, eq(usuarios.id, empresaMembros.usuarioId))
    .where(
      and(
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.status, "ativo"),
        eq(empresas.status, "ativo"),
      ),
    )
    .limit(1);

  return vinculo ?? null;
}

/**
 * Atalho histórico, mantido porque já é consumido em vários pontos.
 * A regra em si vive na matriz de `papeis-escritorio.ts` — aqui só delegamos,
 * para que não exista uma segunda definição de "quem administra".
 */
export function podeAdministrarEscritorio(vinculo: VinculoEscritorio) {
  return permissoesEscritorio(vinculo).administrar;
}

/**
 * Escritórios ativos em que o usuário tem vínculo ativo, com o papel exercido.
 * Consulta única reaproveitada por toda a autorização de escritório — antes ela
 * existia em três cópias quase idênticas.
 */
export async function listarVinculosAtivos(usuarioId: string) {
  return db
    .select({
      empresaId: empresas.id,
      nome: empresas.nome,
      funcao: empresaMembros.funcao,
      empresaLegadaId: usuarios.empresaId,
    })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .innerJoin(usuarios, eq(usuarios.id, empresaMembros.usuarioId))
    .where(
      and(
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.status, "ativo"),
        eq(empresas.status, "ativo"),
      ),
    );
}

/**
 * Escritórios em que o usuário responde como Proprietário ou Administrador.
 * É o escopo administrativo usado pelas regras de cliente.
 */
export async function listarEmpresasAdministradas(usuarioId: string) {
  const vinculos = await listarVinculosAtivos(usuarioId);
  return vinculos
    .filter((vinculo) => permissoesEscritorio(vinculo).administrar)
    .map(({ empresaId }) => empresaId);
}

export async function listarEquipeDoProfissional(usuarioId: string) {
  const [perfilPrestador, escritorios] = await Promise.all([
    db
      .select({ tipoPrestador: perfisProfissionais.tipoPrestador })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
      .limit(1)
      .then(([perfil]) => perfil ?? null),
    listarVinculosAtivos(usuarioId),
  ]);

  const empresaIds = escritorios.map(({ empresaId }) => empresaId);
  const membros = empresaIds.length
    ? await db
        .select({
          id: empresaMembros.id,
          empresaId: empresaMembros.empresaId,
          usuarioId: usuarios.id,
          nome: usuarios.nome,
          email: usuarios.email,
          funcao: empresaMembros.funcao,
          // Necessário para reconhecer o proprietário legado (funcao nula).
          empresaLegadaId: usuarios.empresaId,
          avatarUrl: perfisProfissionais.avatarUrl,
          // Tipo da pessoa: o que ela é. Distinto de `funcao`, que é o papel
          // exercido dentro deste escritório.
          tipoPrestador: perfisProfissionais.tipoPrestador,
          tipoProfissional: perfisProfissionais.tipoProfissional,
          formacao: perfisProfissionais.formacao,
          instituicaoEnsino: perfisProfissionais.instituicaoEnsino,
          tempoExperiencia: perfisProfissionais.tempoExperiencia,
          especialidades: perfisProfissionais.especialidades,
          numeroRegistro: perfisProfissionais.numeroRegistro,
        })
        .from(empresaMembros)
        .innerJoin(usuarios, eq(usuarios.id, empresaMembros.usuarioId))
        .leftJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(
          and(
            inArray(empresaMembros.empresaId, empresaIds),
            eq(empresaMembros.status, "ativo"),
          ),
        )
    : [];

  const recebidos = await db
    .select({
      id: convitesEmpresa.id,
      empresaId: empresas.id,
      empresaNome: empresas.nome,
      remetenteNome: usuarios.nome,
      remetenteTipoPrestador: perfisProfissionais.tipoPrestador,
      remetenteProfissao: perfisProfissionais.tipoProfissional,
      funcao: convitesEmpresa.funcao,
      status: convitesEmpresa.status,
      expiraEm: convitesEmpresa.expiraEm,
      createdAt: convitesEmpresa.createdAt,
    })
    .from(convitesEmpresa)
    .innerJoin(empresas, eq(empresas.id, convitesEmpresa.empresaId))
    .innerJoin(usuarios, eq(usuarios.id, convitesEmpresa.remetenteId))
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(eq(convitesEmpresa.destinatarioId, usuarioId))
    .orderBy(desc(convitesEmpresa.createdAt));

  const empresasAdministradas = escritorios
    .filter((escritorio) => permissoesEscritorio(escritorio).administrar)
    .map(({ empresaId }) => empresaId);
  const enviados = empresasAdministradas.length
    ? await db
        .select({
          id: convitesEmpresa.id,
          empresaId: empresas.id,
          empresaNome: empresas.nome,
          destinatarioNome: usuarios.nome,
          destinatarioEmail: usuarios.email,
          destinatarioTipoPrestador: perfisProfissionais.tipoPrestador,
          destinatarioProfissao: perfisProfissionais.tipoProfissional,
          funcao: convitesEmpresa.funcao,
          status: convitesEmpresa.status,
          expiraEm: convitesEmpresa.expiraEm,
          createdAt: convitesEmpresa.createdAt,
        })
        .from(convitesEmpresa)
        .innerJoin(empresas, eq(empresas.id, convitesEmpresa.empresaId))
        .innerJoin(usuarios, eq(usuarios.id, convitesEmpresa.destinatarioId))
        .leftJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(inArray(convitesEmpresa.empresaId, empresasAdministradas))
        .orderBy(desc(convitesEmpresa.createdAt))
    : [];

  const clientesAtribuidos = empresaIds.length
    ? await db
        .select({
          empresaId: clienteAtribuicoes.empresaId,
          profissionalId: clienteAtribuicoes.profissionalId,
          clienteId: clientes.id,
          codigo: clientes.codigo,
          nome: clientes.nome,
        })
        .from(clienteAtribuicoes)
        .innerJoin(clientes, eq(clientes.id, clienteAtribuicoes.clienteId))
        .where(inArray(clienteAtribuicoes.empresaId, empresaIds))
    : [];

  return {
    // Forma de atuação é contexto, não identidade: quem não tem escritório
    // ativo atua sozinho, independentemente do que o cadastro diz. Antes isto
    // vinha de `modalidade_atuacao`, que ficava desatualizado quando um
    // profissional individual entrava para uma equipe.
    atuaIndividualmente: escritorios.length === 0,
    tipoPrestador: perfilPrestador?.tipoPrestador ?? null,
    // A interface recebe a mesma matriz que o servidor usa para autorizar, em
    // vez de um booleano solto: assim botão escondido e action recusada nunca
    // divergem.
    escritorios: escritorios.map((escritorio) => ({
      ...escritorio,
      papel: papelDoVinculo(escritorio),
      permissoes: permissoesEscritorio(escritorio),
    })),
    membros: membros.map((membro) => ({
      ...membro,
      papel: papelDoVinculo(membro),
    })),
    recebidos,
    enviados,
    clientesAtribuidos,
  };
}

export async function pesquisarProfissionaisDisponiveis(
  usuarioId: string,
  empresaId: string,
  filtros: {
    busca: string;
    profissao?: string;
    estado?: string;
    cidade?: string;
    formacao?: string;
    especialidade?: string;
    modalidade?: "todos" | "individual" | "escritorio";
    tipoPrestador?: "profissional" | "colaborador" | "todos";
    experienciaMinima?: number;
  },
) {
  const pesquisa = await pesquisarProfissionaisReais({
    ...filtros,
    // Sem isto a pesquisa cairia no padrão da vitrine pública (só
    // profissionais) e o escritório nunca encontraria um Colaborador.
    tipoPrestador: filtros.tipoPrestador ?? "todos",
    pagina: 1,
    porPagina: 30,
  });
  const candidatos = pesquisa.profissionais
    .filter(({ id }) => id !== usuarioId)
    .map((item) => ({
      usuarioId: item.id,
      nome: item.nome,
      avatarUrl: item.avatarUrl,
      tipoPrestador: item.tipoPrestador,
      tipoProfissional: item.profissao,
      areasAtuacao: item.areasAtuacao,
      especialidades: item.especialidades,
      cidade: item.cidade,
      estado: item.estado,
      formacao: item.formacao,
      instituicaoEnsino: item.instituicaoEnsino,
      numeroRegistro: item.numeroRegistro,
      tempoExperiencia: item.experiencia,
      modalidade: item.modalidade,
      valorHoraCentavos: item.valorHoraCentavos,
      avaliacaoMedia: item.avaliacaoMedia,
      totalAvaliacoes: item.totalAvaliacoes,
      disponivel: item.disponivel,
    }));

  if (!candidatos.length) return [];
  const ids = candidatos.map(({ usuarioId: id }) => id);
  const [vinculos, convites] = await Promise.all([
    db
      .select({ usuarioId: empresaMembros.usuarioId })
      .from(empresaMembros)
      .where(
        and(
          eq(empresaMembros.empresaId, empresaId),
          eq(empresaMembros.status, "ativo"),
          inArray(empresaMembros.usuarioId, ids),
        ),
      ),
    db
      .select({ usuarioId: convitesEmpresa.destinatarioId })
      .from(convitesEmpresa)
      .where(
        and(
          eq(convitesEmpresa.empresaId, empresaId),
          eq(convitesEmpresa.status, "pendente"),
          gt(convitesEmpresa.expiraEm, new Date()),
          inArray(convitesEmpresa.destinatarioId, ids),
        ),
      ),
  ]);
  const membros = new Set(vinculos.map(({ usuarioId: id }) => id));
  const pendentes = new Set(convites.map(({ usuarioId: id }) => id));
  return candidatos.map((item) => ({
    ...item,
    situacao: (membros.has(item.usuarioId)
      ? "membro"
      : pendentes.has(item.usuarioId)
        ? "convite_pendente"
        : "disponivel") as "membro" | "convite_pendente" | "disponivel",
  }));
}
