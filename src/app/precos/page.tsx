import { PricingPage } from "@/features/precos";
import { PrecoIndisponivel } from "@/features/precos/components/PrecoIndisponivel";
import { obterTabelaDaVitrine } from "@/features/precificacao/queries/obter-tabela-precificacao";
import {
  EVENTOS_PRECIFICACAO,
  registrarFalha,
} from "@/features/precificacao/lib/registro";
import type { TabelaPrecificacao } from "@/features/precificacao/types/precificacao";

/**
 * A configuração comercial é lida a cada visita, no servidor.
 *
 * Sem isto o Next tentaria pré-renderizar a página durante o `build` e o preço
 * exibido seria o do momento em que o deploy aconteceu — um reajuste feito pelo
 * Gestor só apareceria no deploy seguinte. A leitura é uma consulta a sete
 * tabelas minúsculas; o recálculo a cada clique continua acontecendo no
 * navegador, sobre a tabela já entregue.
 */
export const dynamic = "force-dynamic";

/**
 * Falhar aqui não pode virar preço errado.
 *
 * `obterTabelaDaVitrine` só devolve a tabela quando ela passa na estrutura e
 * nas garantias comerciais. Qualquer outra coisa — banco fora do ar, linha
 * faltando, configuração que zeraria um plano — vira `null`, e a página assume
 * o tom comercial em vez de exibir um número em que ninguém pode confiar. O
 * detalhe técnico fica no log do servidor.
 */
async function carregarTabela(): Promise<TabelaPrecificacao | null> {
  try {
    return await obterTabelaDaVitrine();
  } catch (erro) {
    registrarFalha(EVENTOS_PRECIFICACAO.calculoFalhou, { rota: "/precos" }, erro);
    return null;
  }
}

export default async function PrecosRoute() {
  const tabela = await carregarTabela();
  if (!tabela) return <PrecoIndisponivel />;

  return <PricingPage tabela={tabela} />;
}
