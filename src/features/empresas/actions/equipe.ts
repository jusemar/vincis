"use server";

import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/connection";
import {
  convitesEmpresa,
  clienteAtribuicoes,
  clientes,
  empresaMembros,
  perfisProfissionais,
  usuarios,
} from "@/db/schema";
import type { TipoPrestador } from "@/features/usuarios/constants/prestador";
import { condicaoPrestadorHabilitado } from "@/features/usuarios/lib/prestador";
import { condicaoContaVerificada } from "@/features/usuarios/lib/condicao-verificacao";
import { obterPrestadorSessao } from "@/features/usuarios/lib/obter-prestador-sessao";
import {
  funcaoAceitaTipo,
  mensagemConviteIncompativel,
} from "../lib/compatibilidade-convite";
import {
  mensagemPapelRecusado,
  papelDoVinculo,
  permissoesEscritorio,
  podeAlterarPapelMembro,
  podeRemoverMembro,
  type PapelEscritorio,
} from "../lib/papeis-escritorio";
import {
  AlterarPapelMembroSchema,
  EnviarConviteSchema,
  PesquisaProfissionalSchema,
  RemoverMembroSchema,
  ResponderConviteSchema,
  type FuncaoEquipe,
} from "../schemas/equipe";
import {
  listarEquipeDoProfissional,
  obterVinculoAtivo,
  pesquisarProfissionaisDisponiveis,
} from "../queries/equipe";

const NAO_AUTORIZADO = {
  sucesso: false as const,
  mensagem: "Acesso não autorizado.",
};

/**
 * Sessão de prestador habilitado — Profissional aprovado ou Colaborador ativo.
 *
 * A área de equipe abre para os dois tipos, inclusive para quem ainda não é
 * membro de escritório nenhum: é por aqui que um convite é aceito. O que cada
 * um pode fazer dentro dela é decidido pela matriz `permissoesEscritorio`.
 */
async function obterPrestadorHabilitado() {
  const prestador = await obterPrestadorSessao();
  if (!prestador) return null;
  return { id: prestador.usuarioId, tipoPrestador: prestador.tipoPrestador };
}

/**
 * Vínculo do usuário no escritório junto com suas permissões administrativas.
 * Substitui o par `obterVinculoAtivo` + `podeAdministrarEscritorio` que estava
 * repetido em toda action deste arquivo.
 */
async function abrirEscritorio(usuarioId: string, empresaId: string) {
  const vinculo = await obterVinculoAtivo(usuarioId, empresaId);
  return { vinculo, permissoes: permissoesEscritorio(vinculo) };
}

/** Papel e tipo do membro alvo de uma ação administrativa. */
async function obterMembroAlvo(empresaId: string, usuarioId: string) {
  const [membro] = await db
    .select({
      id: empresaMembros.id,
      funcao: empresaMembros.funcao,
      empresaLegadaId: usuarios.empresaId,
      tipoPrestador: perfisProfissionais.tipoPrestador,
    })
    .from(empresaMembros)
    .innerJoin(usuarios, eq(usuarios.id, empresaMembros.usuarioId))
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, usuarios.id),
    )
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.status, "ativo"),
      ),
    )
    .limit(1);

  if (!membro) return null;
  return {
    ...membro,
    papel: papelDoVinculo({ empresaId, ...membro }),
    tipoPrestador: (membro.tipoPrestador as TipoPrestador | null) ?? null,
  };
}

export async function carregarEquipe() {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;
  return {
    sucesso: true as const,
    mensagem: "Equipe carregada.",
    dados: await listarEquipeDoProfissional(sessao.id),
  };
}

export async function pesquisarProfissionais(entrada: unknown) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;
  const validacao = PesquisaProfissionalSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? "Busca inválida.",
    };
  }
  // A própria lista de candidatos já é informação do escritório: só quem
  // convida pode vê-la.
  const { permissoes } = await abrirEscritorio(
    sessao.id,
    validacao.data.empresaId,
  );
  if (!permissoes.convidarMembro) {
    return {
      sucesso: false as const,
      mensagem: "Você não pode convidar para este escritório.",
    };
  }
  return {
    sucesso: true as const,
    mensagem: "Pesquisa concluída.",
    dados: await pesquisarProfissionaisDisponiveis(
      sessao.id,
      validacao.data.empresaId,
      validacao.data,
    ),
  };
}

export async function enviarConviteEmpresa(entrada: unknown) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;
  const validacao = EnviarConviteSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? "Convite inválido.",
    };
  }
  const { empresaId, destinatarioId, funcao } = validacao.data;
  if (destinatarioId === sessao.id) {
    return {
      sucesso: false as const,
      mensagem: "Você não pode convidar a si mesmo.",
    };
  }
  // Convite de vínculo permanente é exclusivo de Proprietário e Administrador.
  // Profissional membro e Colaborador membro nunca chegam aqui.
  const { permissoes } = await abrirEscritorio(sessao.id, empresaId);
  if (!permissoes.convidarMembro) {
    return {
      sucesso: false as const,
      mensagem: "Você não pode convidar para este escritório.",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from empresas where id = ${empresaId} for update`,
      );
      const [destinatario] = await tx
        .select({
          id: usuarios.id,
          tipoPrestador: perfisProfissionais.tipoPrestador,
        })
        .from(usuarios)
        .innerJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(
          and(
            eq(usuarios.id, destinatarioId),
            eq(usuarios.status, "ativo"),
            condicaoContaVerificada(),
            condicaoPrestadorHabilitado(),
          ),
        )
        .limit(1);
      if (!destinatario) {
        return {
          sucesso: false as const,
          mensagem: "Prestador indisponível para convite.",
        };
      }
      // Papel proposto × tipo da pessoa: recusa explícita, nunca conversão
      // silenciosa de colaborador em profissional (ou vice-versa).
      const tipoDestinatario = destinatario.tipoPrestador as TipoPrestador;
      if (!funcaoAceitaTipo(funcao, tipoDestinatario)) {
        return {
          sucesso: false as const,
          mensagem: mensagemConviteIncompativel(funcao, tipoDestinatario),
        };
      }
      const [membro] = await tx
        .select({ id: empresaMembros.id })
        .from(empresaMembros)
        .where(
          and(
            eq(empresaMembros.empresaId, empresaId),
            eq(empresaMembros.usuarioId, destinatarioId),
            eq(empresaMembros.status, "ativo"),
          ),
        )
        .limit(1);
      if (membro)
        return {
          sucesso: false as const,
          mensagem: "Este profissional já faz parte do escritório.",
        };

      const agora = new Date();
      await tx
        .update(convitesEmpresa)
        .set({ status: "expirado", updatedAt: agora })
        .where(
          and(
            eq(convitesEmpresa.empresaId, empresaId),
            eq(convitesEmpresa.destinatarioId, destinatarioId),
            eq(convitesEmpresa.status, "pendente"),
            lte(convitesEmpresa.expiraEm, agora),
          ),
        );
      const [convite] = await tx
        .insert(convitesEmpresa)
        .values({
          empresaId,
          remetenteId: sessao.id,
          destinatarioId,
          funcao,
          expiraEm: new Date(agora.getTime() + 14 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing()
        .returning({ id: convitesEmpresa.id });
      if (!convite)
        return {
          sucesso: false as const,
          mensagem: "Já existe um convite pendente para este profissional.",
        };
      return {
        sucesso: true as const,
        mensagem: "Convite enviado com sucesso.",
      };
    });
  } catch {
    return {
      sucesso: false as const,
      mensagem: "Não foi possível enviar o convite.",
    };
  }
}

export async function responderConviteEmpresa(entrada: unknown) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;
  const validacao = ResponderConviteSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? "Convite inválido.",
    };
  }

  return db.transaction(async (tx) => {
    const [convite] = await tx
      .select()
      .from(convitesEmpresa)
      .where(
        and(
          eq(convitesEmpresa.id, validacao.data.conviteId),
          eq(convitesEmpresa.destinatarioId, sessao.id),
        ),
      )
      .for("update")
      .limit(1);
    if (!convite)
      return { sucesso: false as const, mensagem: "Convite não encontrado." };
    if (convite.status !== "pendente") {
      if (
        convite.status === "aceito" &&
        validacao.data.resposta === "aceitar"
      ) {
        return {
          sucesso: true as const,
          mensagem: "Este convite já foi aceito.",
        };
      }
      if (
        convite.status === "recusado" &&
        validacao.data.resposta === "recusar"
      ) {
        return {
          sucesso: true as const,
          mensagem: "Este convite já foi recusado.",
        };
      }
      return {
        sucesso: false as const,
        mensagem: "Este convite já foi respondido.",
      };
    }
    const agora = new Date();
    if (convite.expiraEm <= agora) {
      await tx
        .update(convitesEmpresa)
        .set({ status: "expirado", updatedAt: agora })
        .where(eq(convitesEmpresa.id, convite.id));
      return { sucesso: false as const, mensagem: "Este convite expirou." };
    }
    if (validacao.data.resposta === "recusar") {
      await tx
        .update(convitesEmpresa)
        .set({ status: "recusado", respondidoEm: agora, updatedAt: agora })
        .where(eq(convitesEmpresa.id, convite.id));
      return { sucesso: true as const, mensagem: "Convite recusado." };
    }

    // Revalidação no aceite: o convite pode ter sido criado antes de uma
    // mudança de tipo da conta. O vínculo nunca é criado com papel incompatível.
    const funcaoConvite = convite.funcao as FuncaoEquipe;
    if (!funcaoAceitaTipo(funcaoConvite, sessao.tipoPrestador)) {
      return {
        sucesso: false as const,
        mensagem: mensagemConviteIncompativel(
          funcaoConvite,
          sessao.tipoPrestador,
        ),
      };
    }

    await tx
      .insert(empresaMembros)
      .values({
        empresaId: convite.empresaId,
        usuarioId: sessao.id,
        funcao: convite.funcao,
        status: "ativo",
      })
      .onConflictDoNothing();
    await tx
      .update(convitesEmpresa)
      .set({ status: "aceito", respondidoEm: agora, updatedAt: agora })
      .where(
        and(
          eq(convitesEmpresa.id, convite.id),
          eq(convitesEmpresa.status, "pendente"),
          gt(convitesEmpresa.expiraEm, agora),
        ),
      );
    return {
      sucesso: true as const,
      mensagem: "Convite aceito. Você agora faz parte do escritório.",
    };
  });
}

export async function listarClientesParaAtribuicao(empresaId: string) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return { ...NAO_AUTORIZADO, dados: null };
  const { permissoes } = await abrirEscritorio(sessao.id, empresaId);
  if (!permissoes.atribuirCliente)
    return {
      sucesso: false as const,
      mensagem: "Você não pode gerenciar atribuições.",
      dados: null,
    };
  const membros = await db
    .select({ usuarioId: empresaMembros.usuarioId })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.status, "ativo"),
      ),
    );
  const ids = membros.map(({ usuarioId }) => usuarioId);
  if (!ids.length)
    return {
      sucesso: true as const,
      mensagem: "Nenhum cliente disponível.",
      dados: [],
    };
  return {
    sucesso: true as const,
    mensagem: "Clientes carregados.",
    dados: await db
      .select({
        id: clientes.id,
        codigo: clientes.codigo,
        nome: clientes.nome,
        proprietarioId: clientes.profissionalId,
      })
      .from(clientes)
      .where(
        and(
          inArray(clientes.profissionalId, ids),
          isNull(clientes.arquivadoEm),
        ),
      ),
  };
}

export async function alterarAtribuicaoCliente(entrada: {
  empresaId: string;
  clienteId: string;
  profissionalId: string;
  atribuir: boolean;
}) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;
  const idsValidos = z.string().uuid();
  if (
    ![entrada.empresaId, entrada.clienteId, entrada.profissionalId].every(
      (id) => idsValidos.safeParse(id).success,
    )
  )
    return { sucesso: false as const, mensagem: "Dados inválidos." };
  const { permissoes } = await abrirEscritorio(sessao.id, entrada.empresaId);
  if (!permissoes.atribuirCliente)
    return {
      sucesso: false as const,
      mensagem: "Você não pode gerenciar atribuições.",
    };
  return db.transaction(async (tx) => {
    const [destinatario] = await tx
      .select({ id: empresaMembros.id })
      .from(empresaMembros)
      .where(
        and(
          eq(empresaMembros.empresaId, entrada.empresaId),
          eq(empresaMembros.usuarioId, entrada.profissionalId),
          eq(empresaMembros.status, "ativo"),
        ),
      )
      .limit(1);
    const [cliente] = await tx
      .select({ id: clientes.id, proprietarioId: clientes.profissionalId })
      .from(clientes)
      .innerJoin(
        empresaMembros,
        and(
          eq(empresaMembros.usuarioId, clientes.profissionalId),
          eq(empresaMembros.empresaId, entrada.empresaId),
          eq(empresaMembros.status, "ativo"),
        ),
      )
      .where(eq(clientes.id, entrada.clienteId))
      .limit(1);
    if (!destinatario || !cliente)
      return {
        sucesso: false as const,
        mensagem: "Cliente ou profissional não pertence a este escritório.",
      };
    if (cliente.proprietarioId === entrada.profissionalId)
      return {
        sucesso: false as const,
        mensagem: "O proprietário já possui acesso ao cliente.",
      };
    if (entrada.atribuir) {
      await tx
        .insert(clienteAtribuicoes)
        .values({
          clienteId: cliente.id,
          empresaId: entrada.empresaId,
          profissionalId: entrada.profissionalId,
          atribuidoPorId: sessao.id,
        })
        .onConflictDoNothing();
      return {
        sucesso: true as const,
        mensagem: "Cliente atribuído com sucesso.",
      };
    }
    await tx
      .delete(clienteAtribuicoes)
      .where(
        and(
          eq(clienteAtribuicoes.clienteId, cliente.id),
          eq(clienteAtribuicoes.profissionalId, entrada.profissionalId),
          eq(clienteAtribuicoes.empresaId, entrada.empresaId),
        ),
      );
    return { sucesso: true as const, mensagem: "Atribuição removida." };
  });
}

/**
 * Remove um membro permanente do escritório.
 *
 * O Proprietário nunca é removido: sem transferência de propriedade, removê-lo
 * deixaria o escritório sem Profissional habilitado responsável. As atribuições
 * de cliente do removido caem junto, para que o acesso termine no mesmo
 * instante — o vínculo é a única fonte daquele acesso.
 */
export async function removerMembroEquipe(entrada: unknown) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;

  const validacao = RemoverMembroSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const { empresaId, usuarioId } = validacao.data;

  const { vinculo } = await abrirEscritorio(sessao.id, empresaId);
  const alvo = await obterMembroAlvo(empresaId, usuarioId);
  if (!alvo)
    return {
      sucesso: false as const,
      mensagem: "Este membro não faz parte do escritório.",
    };

  if (!podeRemoverMembro(vinculo, alvo.papel, usuarioId === sessao.id)) {
    return {
      sucesso: false as const,
      mensagem:
        alvo.papel === "proprietario"
          ? "O Proprietário do escritório não pode ser removido."
          : usuarioId === sessao.id
            ? "Você não pode remover a si mesmo do escritório."
            : "Você não pode remover membros deste escritório.",
    };
  }

  return db.transaction(async (tx) => {
    const agora = new Date();
    const [removido] = await tx
      .update(empresaMembros)
      .set({ status: "removido", updatedAt: agora })
      .where(
        and(
          eq(empresaMembros.empresaId, empresaId),
          eq(empresaMembros.usuarioId, usuarioId),
          eq(empresaMembros.status, "ativo"),
        ),
      )
      .returning({ id: empresaMembros.id });

    if (!removido)
      return {
        sucesso: false as const,
        mensagem: "Este membro não faz parte do escritório.",
      };

    await tx
      .delete(clienteAtribuicoes)
      .where(
        and(
          eq(clienteAtribuicoes.empresaId, empresaId),
          eq(clienteAtribuicoes.profissionalId, usuarioId),
        ),
      );

    return {
      sucesso: true as const,
      mensagem: "Membro removido do escritório.",
    };
  });
}

/**
 * Altera o papel de um membro dentro do escritório.
 *
 * Papel é vínculo, não identidade: promover alguém a Administrador não muda o
 * tipo da pessoa, e o papel novo continua tendo de aceitar aquele tipo — a
 * mesma regra do convite (`funcaoAceitaTipo`). `proprietario` não é destino
 * possível: virar dono exige transferência legítima, fora do escopo desta área.
 */
export async function alterarPapelMembro(entrada: unknown) {
  const sessao = await obterPrestadorHabilitado();
  if (!sessao) return NAO_AUTORIZADO;

  const validacao = AlterarPapelMembroSchema.safeParse(entrada);
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const { empresaId, usuarioId, funcao } = validacao.data;

  const { vinculo } = await abrirEscritorio(sessao.id, empresaId);
  const alvo = await obterMembroAlvo(empresaId, usuarioId);
  if (!alvo)
    return {
      sucesso: false as const,
      mensagem: "Este membro não faz parte do escritório.",
    };

  const novoPapel = funcao as PapelEscritorio;
  if (
    !podeAlterarPapelMembro(vinculo, alvo.papel, novoPapel, alvo.tipoPrestador)
  ) {
    return {
      sucesso: false as const,
      mensagem: permissoesEscritorio(vinculo).alterarPapel
        ? mensagemPapelRecusado(alvo.papel, novoPapel, alvo.tipoPrestador)
        : "Você não pode alterar funções neste escritório.",
    };
  }

  const [atualizado] = await db
    .update(empresaMembros)
    .set({ funcao, updatedAt: new Date() })
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.usuarioId, usuarioId),
        eq(empresaMembros.status, "ativo"),
      ),
    )
    .returning({ id: empresaMembros.id });

  if (!atualizado)
    return {
      sucesso: false as const,
      mensagem: "Este membro não faz parte do escritório.",
    };

  return { sucesso: true as const, mensagem: "Função atualizada." };
}
