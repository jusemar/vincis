/**
 * Porta pública do domínio Videochamada.
 *
 * Só constantes, tipos e as funções puras da janela. O cliente da Daily fica
 * **fora** deste barril de propósito: ele é `server-only`, e um barril
 * importado por componente de cliente arrastaria o módulo — e a chave — junto.
 * Quem precisa dele importa pelo caminho direto, no servidor.
 */
export {
  ACAO_ENTRAR,
  ACAO_SAIR,
  MENSAGENS_DA_JANELA,
  MENSAGEM_FALHA_VIDEOCHAMADA,
  MENSAGEM_SEM_ACESSO_A_VIDEOCHAMADA,
  MINUTOS_ANTES_DA_CONSULTORIA,
  MINUTOS_DE_TOLERANCIA,
  SITUACOES_DA_JANELA,
  TITULO_VIDEOCHAMADA,
  type SituacaoDaJanela,
} from './constants/videochamada'
export {
  janelaAberta,
  janelaDaVideochamada,
  segundosAteAbrir,
  situacaoDaJanela,
  type JanelaDaVideochamada,
} from './lib/janela'
export type {
  ConsultoriaDoAtendimentoDTO,
  ResultadoDeEntrada,
} from './types/videochamada'
