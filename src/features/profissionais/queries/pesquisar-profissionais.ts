import { modeloContratacaoPublico } from "@/features/profissionais/constants/modelo-contratacao";
import { situacoesDocumentos } from "@/features/perfil-pro/lib/perfil-pro";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/connection";
import { nomesDosEscritoriosPublicos } from "@/features/empresas/queries/escritorio-publico";
import { perfisProfissionais, usuarios } from "@/db/schema";
import { obterReputacaoDosPrestadores } from "@/features/avaliacoes/queries/reputacao";
import { condicaoContaVerificada } from "@/features/usuarios/lib/condicao-verificacao";
import { registroDoPrestadorVerificado } from "@/features/usuarios/lib/prestador";
import {
  condicaoPrestadorHabilitado,
  condicaoPrestadorHabilitadoDoTipo,
  condicaoPrestadorPublico,
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
      : filtros.tipoPrestador === "publico"
        ? condicaoPrestadorPublico()
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
  // "Assistente Contábil": o colaborador com vitrine pública, cujo cadastro
  // grava `colaborador` como categoria. Opção própria na busca — "Técnicos"
  // continua sendo só o Especialista Fiscal. O recorte público (vitrine)
  // segue garantido por `condicaoPrestadorPublico`.
  if (filtros.profissao === "assistente_contabil")
    condicoes.push(eq(perfisProfissionais.tipoProfissional, "colaborador"));
  // "Contadores" = só `contabilidade`. O especialista fiscal legado (sem CRC)
  // não é apresentado como contador: aparece em "Todas as Profissões".
  else if (filtros.profissao !== "todos")
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
        modeloContratacao: perfisProfissionais.modeloContratacao,
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
        disponivel: perfisProfissionais.disponivelAtendimento,
        // Só para derivar `registroVerificado`; a chave nunca sai desta query.
        comprovanteRegistroChave: perfisProfissionais.comprovanteRegistroChave,
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
  /**
   * Reputação real, uma consulta agregada para a página inteira.
   *
   * `avaliacao_media` e `total_avaliacoes` de `perfis_profissionais` deixaram de
   * ser lidas aqui: eram números de demonstração escritos por script, e o card
   * público mostrava a mesma nota para sempre. Os nomes dos campos devolvidos
   * continuam os mesmos justamente para que o card não mude uma linha — só a
   * origem do dado mudou. `mediaEmDecimos` mantém a convenção "valor / 10" que
   * a tela já aplicava.
   */
  const reputacoes = await obterReputacaoDosPrestadores(
    registros.map(({ id }) => id),
  );
  // Perfil Essencial/Pro (só advocacia). Rótulo informativo: não entra na
  // ordenação, que segue `created_at` como sempre — Pro não compra exposição.
  // Escritórios: nome do escritório do qual o prestador é proprietário (uma consulta).
  const escritorios = await nomesDosEscritoriosPublicos(
    registros.filter((r) => r.modalidade === "escritorio").map(({ id }) => id),
  );
  const situacoes = await situacoesDocumentos(
    db,
    registros.map(({ id }) => id),
  );

  return {
    profissionais: registros.map(({ comprovanteRegistroChave, ...registro }) => {
      const reputacao = reputacoes.get(registro.id);
      return {
        ...registro,
        // Mesma regra do perfil público: o selo do card só com registro comprovado.
        registroVerificado: registroDoPrestadorVerificado(registro.tipoPrestador, comprovanteRegistroChave),
        // Honorário de advogado não é exibido publicamente: o valor fica no
        // banco, mas não sai daqui — o card mostra "Consultar honorários".
        valorHoraCentavos:
          registro.profissao === "advocacia" ? null : registro.valorHoraCentavos,
        avaliacaoMedia: reputacao?.mediaEmDecimos ?? null,
        perfilAdvocacia: situacoes.get(registro.id)?.nivel ?? null,
        // Contábil: selo só com modelo definido; nunca inventado.
        modeloContratacao: modeloContratacaoPublico(registro.profissao, registro.modeloContratacao),
        totalAvaliacoes: reputacao?.total ?? 0,
        escritorioNome: escritorios.get(registro.id) ?? null,
      };
    }),
    total: total?.valor ?? 0,
    pagina: filtros.pagina,
    totalPaginas: Math.max(
      1,
      Math.ceil((total?.valor ?? 0) / filtros.porPagina),
    ),
  };
}
