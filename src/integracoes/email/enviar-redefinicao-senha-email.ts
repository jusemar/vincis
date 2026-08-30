import { Resend } from 'resend'

type DadosEmailRedefinicao = {
  destinatario: string
  nome: string
  token: string
}

export type ResultadoEnvioEmail =
  | { sucesso: true; id: string | null }
  | { sucesso: false; motivo: 'configuracao' | 'provedor' }

function escaparHtml(valor: string): string {
  return valor.replace(/[&<>'"]/g, (caractere) => {
    const entidades: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entidades[caractere] ?? caractere
  })
}

function criarLinkRedefinicao(token: string): string {
  const appUrl = process.env.APP_URL
  if (!appUrl) throw new Error('APP_URL_NAO_CONFIGURADA')

  const link = new URL('/redefinir-senha', appUrl)
  link.searchParams.set('token', token)
  return link.toString()
}

function criarAssuntoRedefinicao(): string {
  const horarioEmissao = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  // Mesmo motivo do e-mail de confirmação: assunto distinto evita que o
  // cliente de e-mail agrupe um link antigo com o mais recente.
  return `Redefinição de senha na Vincis - ${horarioEmissao}`
}

export async function enviarEmailRedefinicaoSenha({
  destinatario,
  nome,
  token,
}: DadosEmailRedefinicao): Promise<ResultadoEnvioEmail> {
  const apiKey = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_FROM

  if (!apiKey || !remetente || !process.env.APP_URL) {
    console.error('[EMAIL_REDEFINICAO_SENHA] Configuração de e-mail incompleta')
    return { sucesso: false, motivo: 'configuracao' }
  }

  try {
    const linkRedefinicao = criarLinkRedefinicao(token)
    const nomeSeguro = escaparHtml(nome)
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: remetente,
      to: destinatario,
      subject: criarAssuntoRedefinicao(),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#172033">
            <div style="max-width:560px;margin:0 auto;padding:40px 20px">
              <div style="background:#ffffff;border:1px solid #e4e2dc;border-radius:18px;padding:36px">
                <div style="font-size:28px;font-weight:700;margin-bottom:24px">Vincis</div>
                <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px">Redefinir sua senha</h1>
                <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Olá, ${nomeSeguro}.</p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 28px">
                  Recebemos uma solicitação para redefinir a senha da sua conta. Se foi você, clique no botão abaixo para escolher uma nova senha.
                </p>
                <a href="${linkRedefinicao}" style="display:inline-block;background:#b7791f;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">
                  Redefinir minha senha
                </a>
                <p style="font-size:13px;line-height:1.5;color:#667085;margin:28px 0 0">
                  Este link é individual, pode ser utilizado uma única vez e expira em 1 hora. Se você não solicitou essa alteração, ignore este e-mail — sua senha continua a mesma.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Olá, ${nome}. Recebemos uma solicitação para redefinir a senha da sua conta na Vincis. Se foi você, acesse: ${linkRedefinicao}. O link expira em 1 hora e pode ser usado uma única vez. Se não foi você, ignore este e-mail.`,
    })

    if (error) {
      const statusCode = 'statusCode' in error ? error.statusCode : undefined
      console.error('[EMAIL_REDEFINICAO_SENHA] Falha do provedor', {
        nome: error.name,
        statusCode,
        mensagem: error.message,
        remetente,
      })
      if (statusCode === 403) {
        console.error(
          '[EMAIL_REDEFINICAO_SENHA] O provedor está em modo de teste: sem domínio verificado, ' +
            'só entrega no endereço do dono da conta. Verifique um domínio em resend.com/domains ' +
            'e aponte EMAIL_FROM para um endereço desse domínio.',
        )
      }
      return { sucesso: false, motivo: 'provedor' }
    }

    return { sucesso: true, id: data?.id ?? null }
  } catch (error) {
    console.error('[EMAIL_REDEFINICAO_SENHA] Erro ao enviar', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
      mensagem: error instanceof Error ? error.message : undefined,
    })
    return { sucesso: false, motivo: 'provedor' }
  }
}
