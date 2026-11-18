/**
 * Demonstração "Seu profissional, passo a passo" da Home.
 *
 * Os profissionais exibidos são REAIS e públicos, lidos no servidor por
 * `queries/demonstracao-busca.ts` — aqui ficam só o roteiro e os textos.
 */

/**
 * O termo que o cursor digita no campo real de busca. A busca real procura o
 * termo em nome, apresentação, formação, cidade, áreas e especialidades.
 */
export const TERMO_DEMONSTRACAO = "MEI";

/** Telas que o palco sabe desenhar. */
export type TelaDemonstracao = "home" | "listagem" | "perfil";

export type EtapaDemonstracaoBusca = {
  titulo: string;
  resumo: string;
  detalhe: string;
};

/** Texto sincronizado com cada etapa (mesmo formato da jornada de /parceiros). */
export const ETAPAS_DEMONSTRACAO_BUSCA: EtapaDemonstracaoBusca[] = [
  {
    titulo: "Comece por Profissionais",
    resumo: "Em qualquer página da Vincis, o menu do topo leva à vitrine de profissionais.",
    detalhe: "No celular, o mesmo link fica no menu ☰.",
  },
  {
    titulo: "Abra a busca",
    resumo: "A vitrine reúne contadores, advogados e assistentes contábeis, com filtros por profissão e localização.",
    detalhe: "Toque no campo de busca para escrever o que você procura.",
  },
  {
    titulo: "Digite o que precisa",
    resumo: "Escreva um nome, uma profissão ou uma especialidade — por exemplo, “MEI”.",
    detalhe: "A lista se ajusta a cada letra: nome, apresentação, formação, cidade e especialidades entram na busca.",
  },
  {
    titulo: "Compare os cards",
    resumo: "Os resultados reais aparecem juntos: foto, cidade, experiência, formação, especialidades e como se contrata.",
    detalhe: "“Credenciado” aparece só quando o registro (CRC/OAB) foi conferido.",
  },
  {
    titulo: "Veja o perfil completo",
    resumo: "“Ver perfil” abre o perfil público do profissional: apresentação, serviços, formação e avaliações, de cima a baixo.",
    detalhe: "Dali você contrata um serviço, agenda uma consultoria ou pede um orçamento direto.",
  },
];

/** Tempo de leitura depois que a ação da etapa termina, antes de avançar. */
export const LEITURA_APOS_ETAPA_MS = 2200;

/** Intervalo entre caracteres digitados: “MEI” é curto, cada letra precisa ser vista mudando a lista. */
export const INTERVALO_DIGITACAO_MS = 420;
