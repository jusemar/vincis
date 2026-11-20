import { VALIDADE_CODIGO_SMS_MINUTOS } from '@/features/usuarios/constants/recuperacao-senha'
import { celularInternacional } from '@/features/usuarios/lib/telefone'
import { enviarSmsComtele, TAMANHO_MAXIMO_SMS, type ResultadoEnvioSms } from './comtele'

/**
 * SMS do cadastro por celular — um único SMS, sem acentos e sem link. Os
 * textos contêm o código (ou falam da conta) e por isso nunca vão para log.
 */
export function montarMensagemCodigoCadastro(codigo: string): string {
  return `Vincis: seu codigo para criar sua conta e ${codigo}. Valido por ${VALIDADE_CODIGO_SMS_MINUTOS} minutos. Nao compartilhe.`
}

/** Quem tenta cadastrar um número que já tem conta recebe isto — só no próprio celular. */
export const MENSAGEM_CELULAR_JA_CADASTRADO =
  'Vincis: este celular ja tem uma conta. Entre com sua senha ou use Esqueci minha senha. Se nao foi voce, ignore.'

async function enviar(celularNacional: string, mensagem: string): Promise<ResultadoEnvioSms> {
  if (mensagem.length > TAMANHO_MAXIMO_SMS) return { sucesso: false, motivo: 'mensagem_longa' }
  return enviarSmsComtele(celularInternacional(celularNacional), mensagem)
}

export function enviarSmsCodigoCadastro({ celularNacional, codigo }: { celularNacional: string; codigo: string }) {
  return enviar(celularNacional, montarMensagemCodigoCadastro(codigo))
}

export function enviarSmsCelularJaCadastrado({ celularNacional }: { celularNacional: string }) {
  return enviar(celularNacional, MENSAGEM_CELULAR_JA_CADASTRADO)
}

/** Verificação do celular de uma conta que já existe (área logada). */
export function montarMensagemCodigoVerificacao(codigo: string): string {
  return `Vincis: seu codigo para confirmar seu celular e ${codigo}. Valido por ${VALIDADE_CODIGO_SMS_MINUTOS} minutos. Nao compartilhe.`
}

export function enviarSmsCodigoVerificacao({ celularNacional, codigo }: { celularNacional: string; codigo: string }) {
  return enviar(celularNacional, montarMensagemCodigoVerificacao(codigo))
}
