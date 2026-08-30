import { PricingPage } from "@/features/precos";
import { obterTabelaPrecificacao } from "@/features/precificacao/queries/obter-tabela-precificacao";

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

export default async function PrecosRoute() {
  return <PricingPage tabela={await obterTabelaPrecificacao()} />;
}
