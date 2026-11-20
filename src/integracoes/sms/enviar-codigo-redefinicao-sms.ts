import { VALIDADE_CODIGO_SMS_MINUTOS } from '@/features/usuarios/constants/recuperacao-senha'
import { celularInternacional } from '@/features/usuarios/lib/telefone'
import { enviarSmsComtele, TAMANHO_MAXIMO_SMS, type ResultadoEnvioSms } from './comtele'

/**
 * SMS com o código de recuperação de senha: um único SMS (sem acentos — fora
 * do alfabeto básico a operadora pode cobrar/entregar em partes) e SEM link.
 * O texto contém o código e por isso nunca vai para log.
 */
export function montarMensagemCodigoSms(codigo: string): string {
  return `Vincis: seu codigo para redefinir a senha e ${codigo}. Valido por ${VALIDADE_CODIGO_SMS_MINUTOS} minutos. Nao compartilhe.`
}

export async function enviarSmsCodigoRedefinicao({
  celularNacional,
  codigo,
}: {
  celularNacional: string
  codigo: string
}): Promise<ResultadoEnvioSms> {
  const mensagem = montarMensagemCodigoSms(codigo)
  if (mensagem.length > TAMANHO_MAXIMO_SMS) return { sucesso: false, motivo: 'mensagem_longa' }
  return enviarSmsComtele(celularInternacional(celularNacional), mensagem)
}
