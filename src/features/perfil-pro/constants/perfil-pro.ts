/**
 * Perfil Essencial × Perfil Pro — o acesso do advogado aos recursos da Vincis.
 *
 * ## O que muda entre os dois
 *
 * - **Essencial** (sem assinatura): perfil público, busca, pedidos de
 *   orçamento, painel e conversa por **texto**. Documentos não passam pela
 *   Vincis: o Cliente envia ao e-mail profissional de contato.
 * - **Pro** (assinatura paga à Vincis pelo uso da plataforma): libera os
 *   recursos que já existem — envio e recebimento de documentos pela Vincis,
 *   com armazenamento contabilizado.
 *
 * O plano **não** mexe em busca, ordem, destaque nem ranking: Pro compra
 * recursos, não exposição. E não tem relação com honorários de clientes — esses
 * continuam fora da Vincis.
 *
 * Só para `tipo_profissional = 'advocacia'` nesta etapa; as demais categorias
 * seguem como sempre (documentos liberados, sem plano).
 */

/** Código do plano em `assinaturas.plano_codigo`. Não está na vitrine de `/precos`. */
export const PLANO_PERFIL_PRO = 'perfil_pro'
export const NOME_PLANO_PERFIL_PRO = 'Perfil Pro (advocacia)'

/** Valores aprovados. Total = mensal × meses (regra da tabela de assinaturas). */
export const PERIODOS_PERFIL_PRO = [
  { codigo: 'mensal', rotulo: 'Mensal', periodicidade: 'mensal', meses: 1, mensalCentavos: 4_990, totalCentavos: 4_990 },
  { codigo: 'seis_meses', rotulo: '6 meses', periodicidade: 'semestral', meses: 6, mensalCentavos: 4_490, totalCentavos: 26_940 },
  { codigo: 'doze_meses', rotulo: '12 meses', periodicidade: 'anual', meses: 12, mensalCentavos: 3_990, totalCentavos: 47_880 },
] as const

export type PeriodoPerfilPro = (typeof PERIODOS_PERFIL_PRO)[number]
export type CodigoPeriodoPerfilPro = PeriodoPerfilPro['codigo']

/** Rótulos públicos — sem "gratuito" e sem "pago", por decisão de produto. */
export const ROTULO_PERFIL = {
  essencial: { nome: 'Perfil Essencial', card: 'Documentos por e-mail', perfil: 'Perfil Essencial · documentos por e-mail' },
  pro: { nome: 'Perfil Pro', card: 'Documentos pela Vincis', perfil: 'Perfil Pro · documentos diretamente pela Vincis' },
} as const

export type NivelPerfil = keyof typeof ROTULO_PERFIL

/** Identificação do perfil em uso, no painel do advogado (texto aprovado). */
export const PERFIL_ATUAL: Record<NivelPerfil, string> = {
  essencial: 'Perfil atual: Perfil Essencial · Documentos enviados por e-mail',
  pro: 'Perfil atual: Perfil Pro · Documentos enviados pela Vincis',
}

/** Selo discreto dos recursos travados no Essencial. */
export const DISPONIVEL_NO_PRO = 'Disponível no Perfil Pro'

/**
 * Armazenamento.
 *
 * O espaço incluído no Pro (aprovado: 5 GB) é lido de `configuracoes_plataforma`
 * pela chave abaixo, em bytes — a linha é semeada por migration. Sem a linha,
 * o uso é contabilizado e exibido, mas nenhum limite é aplicado.
 */
export const CHAVE_LIMITE_ARMAZENAMENTO_PRO = 'perfil_pro.armazenamento_incluido_bytes'

/**
 * Espaço extra — uma única opção, contratável quantas vezes for preciso:
 * cada adicional pago e vigente soma +5 GB ao limite (Pro 5 GB, 1 adicional =
 * 10 GB, 2 = 15 GB). Mensal, sem renovação automática: vencido, deixa de
 * contar — nenhum arquivo é apagado.
 */
export const PLANO_ARMAZENAMENTO_EXTRA = 'perfil_pro_armazenamento'
export const NOME_PLANO_ARMAZENAMENTO_EXTRA = 'Armazenamento adicional +5 GB'
export const ARMAZENAMENTO_EXTRA_BYTES = 5 * 1024 ** 3
export const ARMAZENAMENTO_EXTRA_CENTAVOS = 990
export const ROTULO_ARMAZENAMENTO_EXTRA = 'Adicionar +5 GB — R$ 9,90/mês'

/** A partir de quanto do limite o painel avisa que está acabando. */
export const PERCENTUAL_ALERTA_ARMAZENAMENTO = 80
