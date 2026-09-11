export { PaginaParceiros } from './components/PaginaParceiros'

/*
  `PainelDoParceiro` não é reexportado aqui de propósito.

  `PaginaParceiros` é a página pública e vive no grafo de cliente (ela mesma
  declara `use client`; a rota é de servidor e lê a configuração de níveis);
  o painel é componente de servidor,
  renderizado dentro da Área do Cliente. Passar os dois pelo mesmo índice faria
  qualquer componente de servidor que importasse este arquivo arrastar a página
  pública — com hooks — para o grafo do servidor. Quem precisa do painel o
  importa pelo caminho dele.
*/
