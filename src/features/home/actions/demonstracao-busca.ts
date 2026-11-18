"use server";

import { obterDemonstracaoBusca, type DadosDemonstracaoBusca } from "../queries/demonstracao-busca";

/**
 * Leitura dos dados públicos da demonstração de busca da Home.
 *
 * Somente leitura, sem entrada (nada a validar) e sem sessão: devolve o mesmo
 * conteúdo público para qualquer visitante, servido do cache de 5 minutos da
 * consulta — a seção pode ser vista por muitos sem multiplicar consultas.
 * É chamada uma vez, quando a seção se aproxima da tela, para não pesar no
 * carregamento inicial da Home.
 */
export async function carregarDemonstracaoBusca(): Promise<
  { sucesso: true; dados: DadosDemonstracaoBusca } | { sucesso: false }
> {
  try {
    return { sucesso: true, dados: await obterDemonstracaoBusca() };
  } catch (erro) {
    console.error("[home/demonstracao-busca] falha ao ler dados públicos", erro);
    return { sucesso: false };
  }
}
