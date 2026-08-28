/**
 * Porta pública do domínio Consultoria Agendada.
 *
 * Constantes, tipos e consultas. As Server Actions de configuração **não**
 * entram aqui de propósito: um barril importado por componente de cliente
 * arrastaria o módulo `'use server'` junto. Quem precisa delas as importa pelo
 * caminho direto, como o resto do projeto já faz.
 */
export {
  DIAS_DA_SEMANA,
  MODALIDADES_CONSULTORIA,
  MODALIDADE_PADRAO,
  ROTULO_DIA_SEMANA,
  ROTULO_MODALIDADE,
  ROTULO_TIPO_EXCECAO,
  TIMEZONE_PADRAO,
  TIPOS_EXCECAO,
  type ModalidadeConsultoria,
  type TipoExcecao,
} from './constants/consultoria'
export {
  ACAO_CONTINUAR,
  LIMITE_DESCRICAO_CONSULTORIA,
  MENSAGEM_HORARIO_INDISPONIVEL,
  PASSOS_CONTRATACAO,
} from './constants/contratacao'
export type {
  AgendaDeDiasDTO,
  AgendaDoDiaDTO,
  ConsultoriaDoPrestadorDTO,
  ConsultoriaPublicaDTO,
  DiaDisponivelDTO,
  HorarioDisponivelDTO,
  SelecaoDeConsultoria,
} from './types/consultoria'
export type {
  ResultadoPreparacao,
  ResumoContratacaoDTO,
} from './types/contratacao'
export { DescricaoConsultoriaSchema } from './schemas/contratacao'
export {
  listarDiasDisponiveis,
  listarHorariosDoDia,
  obterConsultoriaPublica,
} from './queries/agenda-publica'
