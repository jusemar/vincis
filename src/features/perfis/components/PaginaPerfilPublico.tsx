import { notFound } from "next/navigation";
import PerfilProfissionalV2 from "./PerfilProfissionalV2";
import { listarAvaliacoesPublicas } from "@/features/avaliacoes/queries/reputacao";
import { mesDoInstante } from "@/features/consultorias/lib/mes";
import {
  obterAgendaDoMes,
  obterConsultoriaPublica,
} from "@/features/consultorias/queries/agenda-publica";
import { obterDestinatarioPrivado } from "@/features/oportunidades/queries/obter-destinatario-privado";
import {
  listarCasosSucessoPublicos,
  listarExperienciasPublicas,
  listarPerguntasFrequentesPublicas,
} from "@/features/perfis/queries/conteudo-vitrine";
import { obterIdentidadePublicaDaRequisicao } from "@/features/servicos/queries/identidade-publica";
import { DadosEstruturados, obterSeoDoPerfil } from "@/features/seo";
import { ArtigosDoProfissional } from "@/features/conhecimento/components/publico/ArtigosDoProfissional";
import { listarArtigosPublicadosDoAutor } from "@/features/conhecimento/queries/publico";
import { LIMITE_ARTIGOS_NO_PERFIL } from "@/features/conhecimento/constants/limites";
import { caminhoDoPerfilPublico, caminhoPerfilLegado } from "../constants/rotas-perfil";
import { obterSituacaoVitrineDoPerfil } from "../queries/situacao-vitrine";
import { AvisoVitrinePerfil } from "./AvisoVitrinePerfil";
import { montarLinkDeIndicacao } from "@/features/parceiros/constants/destino";
import { baseDoSite } from "@/features/parceiros/lib/link-de-indicacao";
import { obterParceiroDaSessao } from "@/features/parceiros/queries/obter-parceiro";
import { rotaDosPrecosDoProfissional } from "@/features/precificacao-profissional/constants/precificacao-profissional";
import { temPrecosPublicados } from "@/features/precificacao-profissional/queries/obter-configuracao";
import { obterSessaoServidor } from "@/features/usuarios/lib/sessao-servidor";
import { listarServicosPublicos } from "@/features/servicos/queries/vitrine-publica";

/**
 * Perfil público do prestador — corpo compartilhado pelas duas rotas:
 *
 * - `/profissionais/<slug>` (endereço oficial, amigável);
 * - `/perfil-profissional?prestador=<id>` (formato antigo: redireciona para o
 *   amigável quando há perfil público; sem `?prestador=` mostra a vitrine de
 *   demonstração).
 *
 * Componente de servidor: toda a leitura acontece aqui, uma vez, e o
 * componente de cliente recebe os dados prontos.
 */
export async function PaginaPerfilPublico({
  prestadorId,
  exigirPerfilPublico = false,
}: {
  /** Ausente = vitrine de demonstração (sem dono, conteúdo de exemplo). */
  prestadorId?: string;
  /** Rota amigável: sem identidade pública não há página (404), nunca a demonstração. */
  exigirPerfilPublico?: boolean;
}) {
  const identidade = prestadorId
    ? ((await obterIdentidadePublicaDaRequisicao(prestadorId)) ?? undefined)
    : undefined;
  if (exigirPerfilPublico && !identidade) notFound();
  // Mesma leitura memorizada de `generateMetadata`: não repete consulta.
  const { dadosEstruturados } = await obterSeoDoPerfil(prestadorId);

  /**
   * Quem está olhando, se estiver logado. Resolvida uma única vez e reaproveitada
   * abaixo (agenda e permissão de edição) para não repetir a consulta de sessão.
   */
  const sessao = await obterSessaoServidor();

  /*
    O endereço que o botão Compartilhar entrega.

    Quem é parceiro ativo compartilha o **próprio link de indicação** apontando
    para este perfil: a pessoa que abrir passa por `/p/<codigo>`, o acesso é
    registrado pelo mecanismo de sempre e ela cai exatamente aqui. Qualquer
    outro visitante compartilha o endereço normal da página — não existe um
    segundo mecanismo, só um destino a mais no que já existia.

    Sem `?prestador=` é a vitrine de demonstração: não há perfil real para
    divulgar, e o compartilhamento cai na home do link do parceiro.
  */
  const parceiro = prestadorId ? await obterParceiroDaSessao() : null;
  // O link de parceiro aponta para o formato antigo, que é o destino aceito
  // pela lista fechada de `/p/<codigo>` — e que redireciona para o endereço
  // amigável depois que o acesso foi registrado. Os demais visitantes
  // compartilham direto o endereço amigável.
  const linkCompartilhavel = prestadorId
    ? parceiro
      ? montarLinkDeIndicacao(baseDoSite(), parceiro.codigo, caminhoPerfilLegado(prestadorId))
      : `${baseDoSite().replace(/\/+$/, "")}${caminhoDoPerfilPublico(prestadorId, identidade?.slugPublico)}`
    : null;

  /**
   * Só o próprio dono edita, e a prova nunca vem da URL.
   *
   * `prestadorId` chega por `?prestador=`, algo que qualquer visitante controla
   * — por isso a comparação é sempre contra `sessao.id`, nunca o contrário.
   * `identidade` só existe quando a conta está ativa, verificada e habilitada
   * (mesmos critérios de `obterIdentidadePublica`), então exigir `identidade`
   * aqui evita liberar edição para um cadastro que a própria vitrine pública já
   * não mostraria.
   */
  const podeEditar = Boolean(identidade && sessao?.id === prestadorId);

  /**
   * Comentários reais daquele prestador, mais recentes primeiro.
   *
   * Só com `?prestador=`: a vitrine de demonstração não tem dono, e portanto
   * não tem avaliação a mostrar. O array vazio é informação — significa
   * "prestador conhecido, ainda sem avaliação" — e é diferente de `undefined`,
   * que mantém o conteúdo de exemplo.
   */
  const avaliacoes = prestadorId
    ? (await listarAvaliacoesPublicas(prestadorId)).map((avaliacao) => ({
        id: avaliacao.id,
        stars: avaliacao.nota,
        text: avaliacao.comentario,
        // Identidade pública do Cliente, e só ela: nome. E-mail, telefone e
        // documento não são sequer selecionados pela consulta.
        author: avaliacao.autor,
      }))
    : undefined;

  /**
   * A quem o pedido privado seria dirigido.
   *
   * Resolvido no servidor, junto do resto: o perfil é um componente de cliente,
   * e descobrir isso no navegador faria a ação piscar depois da página pronta.
   */
  const destinatario = prestadorId
    ? ((await obterDestinatarioPrivado(prestadorId)) ?? undefined)
    : undefined;

  /**
   * A agenda real do primeiro mês.
   *
   * Duas consultas em vez de uma: a consultoria vem antes porque é ela que diz
   * **qual** é o mês corrente — "hoje" depende do fuso da agenda do
   * Profissional, e não do relógio do servidor nem do visitante. Sem
   * `?prestador=` não há dono, não há consultoria e o card mostra ausência.
   *
   * Resolvido aqui, no servidor, para que o calendário nasça preenchido em vez
   * de piscar depois da página montada — mesmo motivo do destinatário logo
   * acima.
   */
  const consultoria = prestadorId
    ? await obterConsultoriaPublica(prestadorId)
    : null;
  const agendaConsultoria =
    consultoria && prestadorId
      ? await obterAgendaDoMes({
          prestadorId,
          mes: mesDoInstante(new Date(), consultoria.timezone),
          // A reserva temporária do próprio visitante não some da tela dele:
          // quem reservou 14:00 continua vendo 14:00 como seu. Para os demais,
          // o horário está ocupado. Ver `actions/agenda.ts`.
          ignorarClienteId: sessao?.id,
        })
      : null;

  /**
   * Os três blocos ordenáveis de vitrine — ausentes (não `[]`) na vitrine de
   * demonstração, para o componente continuar mostrando o conteúdo de exemplo
   * quando não há `?prestador=`. Com prestador, lista vazia é informação real:
   * "este profissional ainda não cadastrou nenhum item", e o bloco correspondente
   * desaparece em vez de mostrar o mock.
   */
  const casosSucesso = prestadorId
    ? await listarCasosSucessoPublicos(prestadorId)
    : undefined;
  const experiencias = prestadorId
    ? await listarExperienciasPublicas(prestadorId)
    : undefined;
  const faq = prestadorId
    ? await listarPerguntasFrequentesPublicas(prestadorId)
    : undefined;

  /**
   * Este profissional publicou uma tabela de preços própria?
   *
   * Uma consulta de uma linha, e é ela que decide se a chamada "Ver planos e
   * preços" aparece. Sem `?prestador=` não há dono e não há tabela — a vitrine
   * de demonstração não oferece a chamada, do mesmo jeito que não oferece
   * agenda nem pedido de orçamento.
   */
  // Advogado não tem esse bloco: o caminho dele é "Solicitar orçamento".
  const planosEPrecos =
    prestadorId &&
    identidade &&
    identidade.tipoProfissional !== "advocacia" &&
    (await temPrecosPublicados(prestadorId))
      ? rotaDosPrecosDoProfissional(prestadorId)
      : undefined;

  const servicos = prestadorId
    ? (await listarServicosPublicos(prestadorId)).map((servico) => ({
        id: servico.id,
        name: servico.title,
        desc: servico.description,
        price: servico.price,
        chips: servico.chips,
        note: servico.priceNote,
        action: servico.cta,
        outline: servico.isOrcamento,
        modeloPreco: servico.modeloPreco,
      }))
    : undefined;

  /*
    Artigos publicados por este profissional — mesma fonte da Central de
    Conhecimento (só publicados, só deste autor). Sem perfil real, nada.
  */
  const artigos = identidade && prestadorId
    ? await listarArtigosPublicadosDoAutor(prestadorId, LIMITE_ARTIGOS_NO_PERFIL)
    : null;

  /*
    Orientação ao dono quando o perfil está fora da vitrine (sem foto ou
    ocultado pela Gestão). Só ele vê; o visitante não recebe esse dado.
  */
  const situacaoVitrine = podeEditar && prestadorId
    ? await obterSituacaoVitrineDoPerfil(prestadorId)
    : null;

  return (
    <>
      {dadosEstruturados ? (
        <DadosEstruturados dados={dadosEstruturados} />
      ) : null}
      <PerfilProfissionalV2
        avisoDono={
          situacaoVitrine && !situacaoVitrine.naVitrine ? (
            <AvisoVitrinePerfil situacao={situacaoVitrine} />
          ) : undefined
        }
        secaoArtigos={
          artigos ? (
            <ArtigosDoProfissional
              artigos={artigos}
              nomeAutor={identidade?.escritorioNome ?? identidade?.nome ?? ""}
            />
          ) : undefined
        }
        identidade={identidade}
        conteudoNoHtmlInicial={Boolean(identidade)}
        linkCompartilhavel={linkCompartilhavel}
        servicos={servicos}
        avaliacoes={avaliacoes}
        agendaConsultoria={agendaConsultoria}
        podeEditar={podeEditar}
        casosSucesso={casosSucesso}
        experiencias={experiencias}
        faq={faq}
        planosEPrecos={planosEPrecos}
        prestadorId={identidade ? prestadorId : undefined}
        solicitacaoDireta={
          destinatario
            ? {
                id: destinatario.id,
                nome: destinatario.nome,
                categorias: destinatario.categorias,
                especialidadesPorCategoria:
                  destinatario.especialidadesPorCategoria,
                documentosPorEmail: identidade?.perfilAdvocacia === "essencial",
              }
            : undefined
        }
      />
    </>
  );
}
