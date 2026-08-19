import { Resend } from 'resend'

type DadosEmailConfirmacao = {
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

function criarLinkConfirmacao(token: string): string {
  const appUrl = process.env.APP_URL
  if (!appUrl) throw new Error('APP_URL_NAO_CONFIGURADA')

  const link = new URL('/confirmar-email', appUrl)
  link.searchParams.set('token', token)
  return link.toString()
}

function criarAssuntoConfirmacao(): string {
  const horarioEmissao = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  // Um assunto distinto evita que clientes de e-mail agrupem um link antigo com o mais recente.
  return `Confirme seu e-mail na Vincis - ${horarioEmissao}`
}

export async function enviarEmailConfirmacao({
  destinatario,
  nome,
  token,
}: DadosEmailConfirmacao): Promise<ResultadoEnvioEmail> {
  const apiKey = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_FROM

  if (!apiKey || !remetente || !process.env.APP_URL) {
    console.error('[EMAIL_CONFIRMACAO] Configuração de e-mail incompleta')
    return { sucesso: false, motivo: 'configuracao' }
  }

  try {
    const linkConfirmacao = criarLinkConfirmacao(token)
    const nomeSeguro = escaparHtml(nome)
    const resend = new Resend(apiKey)
    // O destinatário é sempre o endereço informado no cadastro. Não existe
    // desvio de destino: se o provedor recusar, a falha é reportada como falha.
    const { data, error } = await resend.emails.send({
      from: remetente,
      to: destinatario,
      subject: criarAssuntoConfirmacao(),
      html: `
        <!doctype html>
        <html lang="pt-BR">
          <body style="margin:0;background:#f4f3ef;font-family:Arial,sans-serif;color:#172033">
            <div style="max-width:560px;margin:0 auto;padding:40px 20px">
              <div style="background:#ffffff;border:1px solid #e4e2dc;border-radius:18px;padding:36px">
                <div style="font-size:28px;font-weight:700;margin-bottom:24px">Vincis</div>
                <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px">Confirme seu e-mail</h1>
                <p style="font-size:16px;line-height:1.6;margin:0 0 12px">Olá, ${nomeSeguro}.</p>
                <p style="font-size:16px;line-height:1.6;margin:0 0 28px">
                  Confirme seu endereço de e-mail para ativar sua conta e acessar a plataforma.
                </p>
                <a href="${linkConfirmacao}" style="display:inline-block;background:#b7791f;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px">
                  Confirmar meu e-mail
                </a>
                <p style="font-size:13px;line-height:1.5;color:#667085;margin:28px 0 0">
                  Este link é individual, pode ser utilizado uma única vez e expira em 24 horas.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `Olá, ${nome}. Confirme seu e-mail na Vincis acessando: ${linkConfirmacao}. O link expira em 24 horas e pode ser usado uma única vez.`,
    })

    if (error) {
      const statusCode = 'statusCode' in error ? error.statusCode : undefined
      // `name` sozinho não distingue nada: o provedor devolve `validation_error`
      // tanto para domínio não verificado (403) quanto para destinatário
      // recusado (422). Sem a mensagem, a falha vira um mistério no log — e ela
      // não contém segredo algum (a API key nunca aparece na resposta).
      console.error('[EMAIL_CONFIRMACAO] Falha do provedor', {
        nome: error.name,
        statusCode,
        mensagem: error.message,
        remetente,
      })
      if (statusCode === 403) {
        console.error(
          '[EMAIL_CONFIRMACAO] O provedor está em modo de teste: sem domínio verificado, ' +
            'só entrega no endereço do dono da conta. Verifique um domínio em resend.com/domains ' +
            'e aponte EMAIL_FROM para um endereço desse domínio.',
        )
      }
      return { sucesso: false, motivo: 'provedor' }
    }

    return { sucesso: true, id: data?.id ?? null }
  } catch (error) {
    console.error('[EMAIL_CONFIRMACAO] Erro ao enviar', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
      mensagem: error instanceof Error ? error.message : undefined,
    })
    return { sucesso: false, motivo: 'provedor' }
  }
}
