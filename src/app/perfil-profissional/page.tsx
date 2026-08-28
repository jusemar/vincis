import PerfilProfissionalV2 from "@/features/perfis/components/PerfilProfissionalV2";
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
import { obterIdentidadePublica } from "@/features/servicos/queries/identidade-publica";
import { obterSessaoServidor } from "@/features/usuarios/lib/sessao-servidor";
import { listarServicosPublicos } from "@/features/servicos/queries/vitrine-publica";

type PerfilProfissionalRouteProps = {
  searchParams: Promise<{ prestador?: string | string[] }>;
};

/**
 * Perfil público do prestador.
 *
 * Com `?prestador=<id>` a seção `Serviços disponíveis` passa a listar o
 * catálogo real daquele prestador (somente ativos e públicos). Sem o parâmetro,
 * a página segue exibindo a vitrine de demonstração — o layout é o mesmo nos
 * dois casos.
 *
 * O mesmo parâmetro decide se o perfil oferece **solicitar orçamento
 * diretamente a esta pessoa**: a ação só aparece quando existe um Profissional
 * real, habilitado e com ao menos uma categoria pública que ele possa atender.
 * As categorias vêm do cadastro dele, e são as únicas que o formulário oferece
 * e que o servidor aceita.
 */
export default async function PerfilProfissionalRoute({
  searchParams,
}: PerfilProfissionalRouteProps) {
  const params = await searchParams;
  const prestadorId = Array.isArray(params.prestador)
    ? params.prestador[0]
    : params.prestador;

  const identidade = prestadorId
    ? ((await obterIdentidadePublica(prestadorId)) ?? undefined)
    : undefined;

  /**
   * Quem está olhando, se estiver logado. Resolvida uma única vez e reaproveitada
   * abaixo (agenda e permissão de edição) para não repetir a consulta de sessão.
   */
  const sessao = await obterSessaoServidor();

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
      }))
    : undefined;

  return (
    <PerfilProfissionalV2
      identidade={identidade}
      servicos={servicos}
      avaliacoes={avaliacoes}
      agendaConsultoria={agendaConsultoria}
      podeEditar={podeEditar}
      casosSucesso={casosSucesso}
      experiencias={experiencias}
      faq={faq}
      solicitacaoDireta={
        destinatario
          ? {
              id: destinatario.id,
              nome: destinatario.nome,
              categorias: destinatario.categorias,
            }
          : undefined
      }
    />
  );
}
