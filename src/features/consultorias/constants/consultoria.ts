/**
 * Vocabulário e limites da Consultoria Agendada.
 *
 * Constantes fechadas pelo mesmo motivo de `atendimentos/constants`: o valor
 * gravado no banco não pode variar conforme o arquivo que escreve, e os limites
 * cobrados pelo Zod precisam ser exatamente os mesmos que os `check` das
 * tabelas cobram — dois números diferentes para a mesma regra produzem um
 * formulário que aceita o que o banco recusa.
 */

/** Como a consultoria acontece. Só existe uma nesta versão. */
export const MODALIDADES_CONSULTORIA = ['online'] as const
export type ModalidadeConsultoria = (typeof MODALIDADES_CONSULTORIA)[number]

export const MODALIDADE_PADRAO: ModalidadeConsultoria = 'online'

export const ROTULO_MODALIDADE: Record<ModalidadeConsultoria, string> = {
  online: 'Online',
}

/**
 * Formas de exceção.
 *
 * - `indisponivel_dia`: o dia inteiro sai do ar;
 * - `bloqueio_parcial`: um intervalo do dia sai;
 * - `disponivel_extra`: um intervalo entra num dia que a recorrência não cobre.
 */
export const TIPOS_EXCECAO = [
  'indisponivel_dia',
  'bloqueio_parcial',
  'disponivel_extra',
] as const
export type TipoExcecao = (typeof TIPOS_EXCECAO)[number]

export const ROTULO_TIPO_EXCECAO: Record<TipoExcecao, string> = {
  indisponivel_dia: 'Dia indisponível',
  bloqueio_parcial: 'Bloqueio parcial',
  disponivel_extra: 'Atendimento excepcional',
}

/**
 * Limites da configuração. Espelham um a um os `check` das tabelas.
 *
 * `DURACAO_MAXIMA_MINUTOS` é oito horas: acima disso não é consultoria, é
 * expediente, e a agenda de um dia teria um slot só. `INTERVALO_MAXIMO` de
 * quatro horas cobre qualquer folga plausível sem permitir que o buffer engula
 * a janela inteira.
 */
export const DURACAO_MINIMA_MINUTOS = 1
export const DURACAO_MAXIMA_MINUTOS = 480
export const INTERVALO_MAXIMO_MINUTOS = 240
/** Trinta dias. Antecedência maior que isso já é horizonte, não antecedência. */
export const ANTECEDENCIA_MAXIMA_MINUTOS = 43_200
export const HORIZONTE_MINIMO_DIAS = 1
export const HORIZONTE_MAXIMO_DIAS = 365

/** Padrões de produto para quem está configurando pela primeira vez. */
export const ANTECEDENCIA_PADRAO_MINUTOS = 120
export const HORIZONTE_PADRAO_DIAS = 60
export const DURACAO_PADRAO_MINUTOS = 60
export const INTERVALO_PADRAO_MINUTOS = 0

/**
 * Fuso padrão da agenda.
 *
 * `America/Sao_Paulo` é o mesmo que a plataforma já assume ao formatar a data
 * de confirmação de e-mail (`integracoes/email/enviar-confirmacao-email.ts`) —
 * é um default coerente com o que existe, e não uma regra: a coluna é por
 * consultoria e qualquer identificador IANA válido é aceito.
 */
export const TIMEZONE_PADRAO = 'America/Sao_Paulo'

/** Teto de faixas semanais. Agenda é rotina, não colcha de retalhos. */
export const LIMITE_FAIXAS_SEMANAIS = 40

/** Dias da semana na convenção do JavaScript: 0 = domingo … 6 = sábado. */
export const DIAS_DA_SEMANA = [0, 1, 2, 3, 4, 5, 6] as const
export type DiaDaSemana = (typeof DIAS_DA_SEMANA)[number]

export const ROTULO_DIA_SEMANA: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
}
