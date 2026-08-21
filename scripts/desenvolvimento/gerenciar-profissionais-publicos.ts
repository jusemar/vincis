import { eq, inArray, or } from "drizzle-orm";
import { db } from "../../src/db/connection";
import {
  clienteAtribuicoes,
  convitesEmpresa,
  empresaMembros,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from "../../src/db/schema";
import { gerarHash } from "../../src/features/usuarios/lib/hash-senha";

const PREFIXO = "demo.profissional.";
const SENHA_TEMPORARIA = "Teste@123456";
const MODELOS = [
  [
    "ricardo.mendes",
    "Dr. Ricardo Mendes",
    "contabilidade",
    "Contabilidade Fiscal",
    "São Paulo",
    "SP",
    15,
    250,
    "Bacharel em Ciências Contábeis",
    "",
    [
      "Planejamento Tributário",
      "Contabilidade Societária",
      "Auditoria",
      "SPED",
    ],
    ["CRC Ativo", "Certificação CVM", "Especialista em IFRS"],
    "Especialista em planejamento tributário para empresas de médio e grande porte. Experiência em otimização fiscal e compliance contábil.",
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop",
  ],
  [
    "ana.silva",
    "Dra. Ana Carolina Silva",
    "advocacia",
    "Direito Empresarial",
    "Rio de Janeiro",
    "RJ",
    12,
    350,
    "Bacharel em Direito",
    "UFRJ",
    [
      "Contratos Empresariais",
      "Fusões e Aquisições",
      "Societário",
      "Compliance",
    ],
    ["OAB/RJ", "Especialista em Direito Societário", "Arbitragem"],
    "Advogada especializada em direito empresarial com foco em startups e empresas em crescimento. Experiência em operações de M&A.",
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop",
  ],
  [
    "carlos.lima",
    "Carlos Eduardo Lima",
    "contabilidade",
    "Contabilidade para MEI",
    "Belo Horizonte",
    "MG",
    8,
    120,
    "Bacharel em Ciências Contábeis",
    "UFMG",
    ["MEI", "Simples Nacional", "Abertura de Empresas", "Regularização"],
    ["CRC Ativo", "Especialista em MEI"],
    "Contador especializado em atender MEIs e pequenas empresas. Foco em simplificação e baixo custo para empreendedores.",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop",
  ],
  [
    "fernanda.oliveira",
    "Dra. Fernanda Oliveira",
    "advocacia",
    "Direito Trabalhista",
    "São Paulo",
    "SP",
    10,
    300,
    "Bacharel em Direito",
    "USP",
    ["Reclamações Trabalhistas", "Auditoria Trabalhista", "Acordos", "CCT"],
    ["OAB/SP", "Especialista em Direito do Trabalho", "Mediadora"],
    "Advogada trabalhista com vasta experiência em defesa de empresas. Especialista em prevenção de passivos trabalhistas.",
    "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop",
  ],
  [
    "marcelo.santos",
    "Marcelo Santos",
    "especialista_fiscal",
    "Consultor de RH",
    "Curitiba",
    "PR",
    11,
    180,
    "Administração",
    "PUCPR",
    [
      "Folha de Pagamento",
      "Departamento Pessoal",
      "Recrutamento",
      "Treinamento",
    ],
    ["CIPD", "SHRM-CP", "Coach Profissional"],
    "Consultor de RH com experiência em gestão de pessoas para empresas de tecnologia e serviços.",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop",
  ],
  [
    "juliana.costa",
    "Dra. Juliana Costa",
    "advocacia",
    "Direito Tributário",
    "Brasília",
    "DF",
    14,
    450,
    "Bacharel em Direito",
    "UNB",
    [
      "Contencioso Tributário",
      "Planejamento Tributário",
      "Recuperação de Créditos",
      "CARF",
    ],
    ["OAB/DF", "Especialista em Direito Tributário", "LLM Tributário"],
    "Advogada tributarista com experiência em grandes escritórios. Atuação no contencioso administrativo e judicial.",
    "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=400&h=400&fit=crop",
  ],
  [
    "roberto.almeida",
    "Roberto Almeida",
    "contabilidade",
    "Auditoria Contábil",
    "Porto Alegre",
    "RS",
    20,
    380,
    "Bacharel em Ciências Contábeis",
    "UFRGS",
    ["Auditoria Independente", "Due Diligence", "Perícia Contábil", "IFRS"],
    ["CRC Ativo", "Auditor Independente - CVM", "Perito Judicial"],
    "Contador com vasta experiência em auditoria para empresas listadas em bolsa. Perito judicial contábil.",
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop",
  ],
  [
    "patricia.mendonca",
    "Patrícia Mendonça",
    "especialista_fiscal",
    "Consultora Financeira",
    "São Paulo",
    "SP",
    9,
    220,
    "Economia",
    "FGV",
    [
      "Planejamento Financeiro",
      "Fluxo de Caixa",
      "Análise de Investimentos",
      "Budget",
    ],
    ["CFA", "CPA", "MBA em Finanças"],
    "Consultora financeira com experiência em grandes corporações. Ajuda empresas a otimizarem sua gestão financeira.",
    "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop",
  ],
  [
    "bruno.ferreira",
    "Dr. Bruno Ferreira",
    "advocacia",
    "Direito Civil",
    "Salvador",
    "BA",
    7,
    200,
    "Bacharel em Direito",
    "UFBA",
    [
      "Contratos",
      "Responsabilidade Civil",
      "Direito de Família",
      "Inventários",
    ],
    ["OAB/BA", "Mediador"],
    "Advogado civilista com atuação em consultoria preventiva e contencioso. Atendimento humanizado e próximo.",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop",
  ],
] as const;

function garantirAmbienteLocal() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    throw new Error("Script de demonstração indisponível em produção.");
  }
}

function imprimirCredenciais(modelo: (typeof MODELOS)[number]) {
  const email = `${PREFIXO}${modelo[0]}@vincis.local`;
  const profissao =
    modelo[2] === "contabilidade"
      ? "Contador"
      : modelo[2] === "advocacia"
        ? "Advogado"
        : "Especialista fiscal";
  console.log(
    `${modelo[1]} | ${email} | ${SENHA_TEMPORARIA} | ${profissao} | Atuação individual`,
  );
}

async function criar() {
  garantirAmbienteLocal();
  const [perfil] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, "profissional"))
    .limit(1);
  if (!perfil) throw new Error("Perfil profissional não encontrado.");
  const senhaHash = await gerarHash(SENHA_TEMPORARIA);
  for (const m of MODELOS) {
    const email = `${PREFIXO}${m[0]}@vincis.local`;
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    if (existente) {
      await db
        .update(usuarios)
        .set({
          senhaHash,
          status: "ativo",
          emailVerificado: true,
          emailVerificadoEm: new Date(),
        })
        .where(eq(usuarios.id, existente.id));
      imprimirCredenciais(m);
      continue;
    }
    await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(usuarios)
        .values({
          nome: m[1],
          email,
          senhaHash,
          status: "ativo",
          emailVerificado: true,
          emailVerificadoEm: new Date(),
        })
        .returning({ id: usuarios.id });
      await tx
        .insert(usuariosPerfis)
        .values({ usuarioId: u.id, perfilId: perfil.id });
      await tx.insert(perfisProfissionais).values({
        usuarioId: u.id,
        tipoProfissional: m[2],
        areasAtuacao: [m[3]],
        especialidades: [...m[10]],
        certificacoes: [...m[11]],
        apresentacao: m[12],
        avatarUrl: m[13],
        nomeAtuacao: m[1],
        modalidadeAtuacao: "individual",
        cidade: m[4],
        estado: m[5],
        tempoExperiencia: m[6],
        formacao: m[8],
        instituicaoEnsino: m[9],
        valorHoraCentavos: m[7] * 100,
        // Avaliação vem sempre das avaliações reais
        // (`avaliacoes_atendimento`), agregadas a cada consulta. Nenhum
        // cadastro de demonstração nasce com nota nem com contador: um número
        // aqui reapareceria no card público como se fosse reputação.
        avaliacaoMedia: null,
        totalAvaliacoes: 0,
        disponivelAtendimento: ![
          "fernanda.oliveira",
          "patricia.mendonca",
        ].includes(m[0]),
        telefoneContato: "0000000000",
        emailProfissional: email,
        statusAnalise: "aprovado",
        enviadoEm: new Date(),
        analisadoEm: new Date(),
      });
    });
    imprimirCredenciais(m);
  }
  console.log("Profissionais públicos de desenvolvimento preparados.");
}

async function remover() {
  garantirAmbienteLocal();
  const emails = MODELOS.map((m) => `${PREFIXO}${m[0]}@vincis.local`);
  const contas = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(inArray(usuarios.email, emails));
  const ids = contas.map(({ id }) => id);
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    await tx
      .delete(clienteAtribuicoes)
      .where(inArray(clienteAtribuicoes.profissionalId, ids));
    await tx
      .delete(convitesEmpresa)
      .where(
        or(
          inArray(convitesEmpresa.remetenteId, ids),
          inArray(convitesEmpresa.destinatarioId, ids),
        ),
      );
    await tx
      .delete(empresaMembros)
      .where(inArray(empresaMembros.usuarioId, ids));
    await tx
      .delete(sessoesUsuario)
      .where(inArray(sessoesUsuario.usuarioId, ids));
    await tx.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids));
    await tx
      .delete(perfisProfissionais)
      .where(inArray(perfisProfissionais.usuarioId, ids));
    await tx
      .delete(usuariosPerfis)
      .where(inArray(usuariosPerfis.usuarioId, ids));
    await tx.delete(usuarios).where(inArray(usuarios.id, ids));
  });
  console.log("Profissionais públicos de desenvolvimento removidos.");
}

void (async () => {
  if (process.argv[2] === "criar") await criar();
  else if (process.argv[2] === "remover") await remover();
  else throw new Error("Use criar ou remover.");
  process.exit(0);
})();
