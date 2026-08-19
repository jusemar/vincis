"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/connection";
import { perfisProfissionais } from "@/db/schema";
import { STATUS_PRESTADOR_HABILITADO } from "../constants/prestador";
import { ehPessoaColaborador } from "../lib/prestador";
import { obterSessaoServidor } from "../lib/sessao-servidor";
import {
  PerfilColaboradorSchema,
  type PerfilColaboradorDTO,
} from "../schemas/perfil-colaborador";

/**
 * Valor gravado em `tipo_profissional` para as linhas de colaborador.
 *
 * A coluna é NOT NULL e existe para a categoria regulamentada do Profissional.
 * O Colaborador não tem categoria regulamentada, então gravamos o próprio tipo
 * em vez de atribuir a ele uma profissão que não é a dele. O que ele realmente
 * faz fica em `areas_atuacao` e `especialidades`, preenchidos por ele.
 */
const TIPO_PROFISSIONAL_COLABORADOR = "colaborador";

function listaDeTexto(valor: string) {
  return valor
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Cria ou atualiza o cadastro do Colaborador.
 *
 * O cadastro entra habilitado (`status_analise = 'ativo'`) porque não existe
 * habilitação técnica regulamentada a analisar — e é justamente isso que evita
 * marcar o Colaborador como `aprovado` artificialmente para liberar o /admin.
 */
export async function salvarPerfilColaborador(dados: PerfilColaboradorDTO) {
  const usuario = await obterSessaoServidor();
  if (!usuario || !ehPessoaColaborador(usuario.perfilTipo))
    return { sucesso: false, mensagem: "Operação não autorizada." };

  const entrada = dados as Record<string, unknown>;
  // Campos de reputação e de habilitação nunca vêm do formulário.
  const camposProibidos = [
    "avaliacaoMedia",
    "totalAvaliacoes",
    "statusAnalise",
    "tipoPrestador",
    "numeroRegistro",
  ];
  if (camposProibidos.some((campo) => campo in entrada)) {
    return {
      sucesso: false,
      mensagem: "Os dados enviados contêm campos que não podem ser alterados.",
    };
  }

  const validacao = PerfilColaboradorSchema.safeParse(dados);
  if (!validacao.success)
    return {
      sucesso: false,
      mensagem:
        validacao.error.issues[0]?.message ?? "Revise os dados informados.",
    };
  const valor = validacao.data;

  const [anterior] = await db
    .select({
      id: perfisProfissionais.id,
      tipoPrestador: perfisProfissionais.tipoPrestador,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuario.id))
    .limit(1);

  // Uma conta que já tem cadastro de profissional não vira colaborador por
  // aqui: seria uma troca silenciosa de tipo, com registro e comprovante
  // pendurados no mesmo registro.
  if (anterior && anterior.tipoPrestador !== "colaborador") {
    return {
      sucesso: false,
      mensagem:
        "Esta conta já possui cadastro profissional. Fale com o suporte para alterar o tipo de conta.",
    };
  }

  const agora = new Date();
  const registro = {
    tipoPrestador: "colaborador" as const,
    tipoProfissional: TIPO_PROFISSIONAL_COLABORADOR,
    // Colaborador não é proprietário de escritório: a forma de atuação própria
    // dele é sempre individual. O vínculo com um escritório, quando existir,
    // vem de `empresa_membros`.
    modalidadeAtuacao: "individual" as const,
    numeroRegistro: null,
    estadoRegistro: null,
    nomeAtuacao: valor.nomeAtuacao,
    apresentacao: valor.apresentacao,
    cidade: valor.cidade,
    estado: valor.estado,
    cep: valor.cep || null,
    logradouro: valor.logradouro || null,
    numero: valor.numero || null,
    complemento: valor.complemento || null,
    bairro: valor.bairro || null,
    tempoExperiencia: valor.tempoExperiencia,
    formacao: valor.formacao || null,
    instituicaoEnsino: valor.instituicaoEnsino || null,
    areasAtuacao: listaDeTexto(valor.areasAtuacao),
    especialidades: listaDeTexto(valor.especialidades),
    certificacoes: listaDeTexto(valor.certificacoes),
    valorHoraCentavos: Math.round(valor.valorHora * 100),
    disponivelAtendimento: valor.disponivelAtendimento,
    regimesAtendidos: valor.regimesAtendidos,
    telefoneContato: valor.telefoneContato,
    emailProfissional: valor.emailProfissional,
    statusAnalise: STATUS_PRESTADOR_HABILITADO.colaborador,
    observacaoAnalise: null,
    enviadoEm: agora,
    // Não há análise de habilitação para o colaborador.
    analisadoEm: null,
  };

  try {
    await db
      .insert(perfisProfissionais)
      .values({ usuarioId: usuario.id, ...registro })
      .onConflictDoUpdate({
        target: perfisProfissionais.usuarioId,
        set: { ...registro, updatedAt: agora },
      });
    return { sucesso: true, mensagem: "Perfil de colaborador salvo." };
  } catch {
    return { sucesso: false, mensagem: "Não foi possível salvar o cadastro." };
  }
}

export async function obterMeuPerfilColaborador() {
  const usuario = await obterSessaoServidor();
  if (!usuario || !ehPessoaColaborador(usuario.perfilTipo)) return null;
  const [perfil] = await db
    .select()
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuario.id))
    .limit(1);
  if (!perfil || perfil.tipoPrestador !== "colaborador") return null;
  return {
    ...perfil,
    areasAtuacao: perfil.areasAtuacao.join(", "),
    especialidades: perfil.especialidades.join(", "),
    certificacoes: perfil.certificacoes.join(", "),
    valorHora: (perfil.valorHoraCentavos ?? 0) / 100,
  };
}
