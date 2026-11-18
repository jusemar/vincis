import { unstable_cache } from "next/cache";
import type { ComponentProps } from "react";
import { listarAvaliacoesPublicas } from "@/features/avaliacoes/queries/reputacao";
import { mesDoInstante } from "@/features/consultorias/lib/mes";
import { obterAgendaDoMes, obterConsultoriaPublica } from "@/features/consultorias/queries/agenda-publica";
import { obterDestinatarioPrivado } from "@/features/oportunidades/queries/obter-destinatario-privado";
import { baseDoSite } from "@/features/parceiros/lib/link-de-indicacao";
import type PerfilProfissionalV2 from "@/features/perfis/components/PerfilProfissionalV2";
import {
  listarCasosSucessoPublicos,
  listarExperienciasPublicas,
  listarPerguntasFrequentesPublicas,
} from "@/features/perfis/queries/conteudo-vitrine";
import { rotaDosPrecosDoProfissional } from "@/features/precificacao-profissional/constants/precificacao-profissional";
import { temPrecosPublicados } from "@/features/precificacao-profissional/queries/obter-configuracao";
import { paraCartaoProfissional, passaNosFiltrosIniciaisDaVitrine } from "@/features/profissionais/lib/cartao-profissional";
import { pesquisarProfissionaisReais } from "@/features/profissionais/queries/pesquisar-profissionais";
import type { Professional } from "@/features/profissionais/types/profissionais";
import { obterIdentidadePublica } from "@/features/servicos/queries/identidade-publica";
import { listarServicosPublicos } from "@/features/servicos/queries/vitrine-publica";
import { TERMO_DEMONSTRACAO } from "../constants/demonstracao-busca";

/**
 * Dados REAIS da demonstração "Seu profissional, passo a passo" da Home.
 *
 * Somente leitura e somente o que já é público:
 *
 * - a listagem usa `pesquisarProfissionaisReais` com `tipoPrestador: "publico"`
 *   e os filtros iniciais da vitrine — exatamente o que `/profissionais` pede
 *   ao servidor quando alguém digita na busca. Cada prefixo do termo ("", "M",
 *   "ME", "MEI") é lido para a lista mudar letra a letra como na vitrine;
 * - o perfil é montado com as mesmas consultas públicas da rota
 *   `/perfil-profissional?prestador=`, para o primeiro card disponível da
 *   busca. O que lá depende de quem está logado fica de fora: edição (sempre
 *   falsa), link de indicação do parceiro e a reserva temporária do visitante.
 *
 * Em cache por 5 minutos: a Home não consulta o banco a cada visita.
 */

/** Props do perfil público real, menos o que depende de sessão. */
export type PerfilDemonstracao = Omit<ComponentProps<typeof PerfilProfissionalV2>, "podeEditar" | "prestadorId">;

export type ResultadoBuscaDemonstracao = { profissionais: Professional[]; total: number };

export type DadosDemonstracaoBusca = {
  /** Resultado de cada prefixo do termo digitado, na ordem da vitrine. */
  buscas: Record<string, ResultadoBuscaDemonstracao>;
  /** Id do card clicado — o primeiro disponível no resultado completo. */
  selecionadoId: string | null;
  /** Perfil público de `selecionadoId`; `null` quando não há resultado. */
  perfil: PerfilDemonstracao | null;
};

/** Mesmo tamanho de página da vitrine. */
const POR_PAGINA = 9;
const CINCO_MINUTOS = 300;

async function lerBusca(busca: string): Promise<ResultadoBuscaDemonstracao> {
  const resultado = await pesquisarProfissionaisReais({ busca, tipoPrestador: "publico", pagina: 1, porPagina: POR_PAGINA });
  return {
    profissionais: resultado.profissionais.map(paraCartaoProfissional).filter(passaNosFiltrosIniciaisDaVitrine),
    total: resultado.total,
  };
}

/** Mesmo conjunto de dados que a rota `/perfil-profissional` entrega a um visitante anônimo. */
async function lerPerfilPublico(prestadorId: string): Promise<PerfilDemonstracao | null> {
  const identidade = await obterIdentidadePublica(prestadorId);
  // Sem identidade pública (conta inativa, não verificada...), não há perfil a mostrar.
  if (!identidade) return null;

  const consultoria = await obterConsultoriaPublica(prestadorId);
  const [avaliacoes, destinatario, agenda, casosSucesso, experiencias, faq, servicos, temPrecos] = await Promise.all([
    listarAvaliacoesPublicas(prestadorId),
    obterDestinatarioPrivado(prestadorId),
    consultoria ? obterAgendaDoMes({ prestadorId, mes: mesDoInstante(new Date(), consultoria.timezone) }) : null,
    listarCasosSucessoPublicos(prestadorId),
    listarExperienciasPublicas(prestadorId),
    listarPerguntasFrequentesPublicas(prestadorId),
    listarServicosPublicos(prestadorId),
    identidade.tipoProfissional !== "advocacia" ? temPrecosPublicados(prestadorId) : false,
  ]);

  return {
    identidade,
    // O endereço normal da página — o que qualquer visitante não parceiro compartilha.
    linkCompartilhavel: `${baseDoSite().replace(/\/+$/, "")}/perfil-profissional?prestador=${encodeURIComponent(prestadorId)}`,
    avaliacoes: avaliacoes.map((avaliacao) => ({
      id: avaliacao.id,
      stars: avaliacao.nota,
      text: avaliacao.comentario,
      author: avaliacao.autor,
    })),
    agendaConsultoria: agenda,
    casosSucesso,
    experiencias,
    faq,
    planosEPrecos: temPrecos ? rotaDosPrecosDoProfissional(prestadorId) : undefined,
    servicos: servicos.map((servico) => ({
      id: servico.id,
      name: servico.title,
      desc: servico.description,
      price: servico.price,
      chips: servico.chips,
      note: servico.priceNote,
      action: servico.cta,
      outline: servico.isOrcamento,
      modeloPreco: servico.modeloPreco,
    })),
    solicitacaoDireta: destinatario
      ? {
          id: destinatario.id,
          nome: destinatario.nome,
          categorias: destinatario.categorias,
          especialidadesPorCategoria: destinatario.especialidadesPorCategoria,
          documentosPorEmail: identidade.perfilAdvocacia === "essencial",
        }
      : undefined,
  };
}

async function lerDemonstracaoBusca(): Promise<DadosDemonstracaoBusca> {
  const prefixos = Array.from({ length: TERMO_DEMONSTRACAO.length + 1 }, (_, i) => TERMO_DEMONSTRACAO.slice(0, i));
  const resultados = await Promise.all(prefixos.map(lerBusca));
  const buscas = Object.fromEntries(prefixos.map((prefixo, i) => [prefixo, resultados[i]]));
  // O card clicado precisa ter "Ver perfil" ativo — o botão real fica
  // desabilitado para quem está indisponível.
  const selecionado = buscas[TERMO_DEMONSTRACAO].profissionais.find((item) => item.isAvailable) ?? null;
  const perfil = selecionado ? await lerPerfilPublico(selecionado.id) : null;
  return { buscas, selecionadoId: perfil && selecionado ? selecionado.id : null, perfil };
}

export const obterDemonstracaoBusca = unstable_cache(lerDemonstracaoBusca, ["home-demonstracao-busca-v1"], {
  revalidate: CINCO_MINUTOS,
  tags: ["home-demonstracao-busca"],
});
