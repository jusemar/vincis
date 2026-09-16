import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  MENSAGENS_UPLOAD_FISCAL,
  TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL,
  type CodigoRecusaLote,
} from '@/features/documentos-fiscais/constants/upload'
import { receberXmlsFiscais } from '@/features/documentos-fiscais/lib/receber-xml-fiscal'
import { lerEmpresaAtivaCookie } from '@/features/empresas/lib/contexto-empresa-cookie'
import { resolverContextoTenant } from '@/features/empresas/lib/resolver-contexto-tenant'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'

/**
 * Recebimento de XMLs fiscais (multipart: `arquivos[]` e `clienteId` opcional).
 *
 * Rota, e não Server Action, por causa do tamanho: Server Actions aceitam 1 MB
 * por padrão, e subir esse teto valeria para todas as actions da Vincis.
 *
 * Tamanho em três camadas, todas com os limites de `constants/upload`:
 * `Content-Length` declarado (antes de ler o corpo), bytes efetivamente lidos
 * (a leitura para no limite) e soma real dos arquivos (em `receberXmlsFiscais`).
 *
 * A empresa nunca vem do formulário: é o contexto ativo da sessão, validado pelo
 * vínculo (`resolverContextoTenant`) e de novo pela autorização fiscal dentro de
 * `receberXmlsFiscais`. O cookie de sessão é `SameSite=Strict`; a origem também
 * é conferida quando o navegador a informa.
 */
const ClienteIdSchema = z.string().uuid()

const STATUS_RECUSA: Record<CodigoRecusaLote, number> = {
  SEM_AUTENTICACAO: 401,
  SEM_PERMISSAO: 403,
  CLIENTE_FORA_DO_ESCOPO: 403,
  CLIENTE_OBRIGATORIO: 400,
  LOTE_VAZIO: 400,
  LOTE_MUITO_GRANDE: 413,
  REQUISICAO_INVALIDA: 400,
}

function recusar(codigo: CodigoRecusaLote) {
  return NextResponse.json(
    { sucesso: false, codigo, mensagem: MENSAGENS_UPLOAD_FISCAL[codigo] },
    { status: STATUS_RECUSA[codigo], headers: { 'Cache-Control': 'no-store' } },
  )
}

function origemPermitida(request: Request) {
  const origem = request.headers.get('origin')
  if (!origem) return true
  try {
    return new URL(origem).host === (request.headers.get('host') ?? new URL(request.url).host)
  } catch {
    return false
  }
}

/**
 * Lê o corpo contando bytes e desiste assim que passar do limite — a proteção
 * que não depende de `Content-Length` (ausente em envio fragmentado, ou
 * divergente do que realmente chega).
 */
async function lerCorpoLimitado(request: Request, limite: number): Promise<Uint8Array<ArrayBuffer> | 'excede'> {
  if (!request.body) return new Uint8Array(0)
  const leitor = request.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.byteLength
    if (total > limite) {
      await leitor.cancel().catch(() => undefined)
      return 'excede'
    }
    partes.push(value)
  }
  const corpo = new Uint8Array(total)
  let posicao = 0
  for (const parte of partes) {
    corpo.set(parte, posicao)
    posicao += parte.byteLength
  }
  return corpo
}

export async function POST(request: Request) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return recusar('SEM_AUTENTICACAO')
  if (!origemPermitida(request)) return recusar('SEM_PERMISSAO')

  // Recusa barata, antes de resolver contexto e de ler um byte do corpo. Ausente
  // não é recusa: a leitura limitada abaixo e a soma real dos arquivos protegem.
  const declarado = request.headers.get('content-length')
  if (declarado !== null) {
    if (!/^\d+$/.test(declarado.trim()) || Number(declarado) === 0) return recusar('REQUISICAO_INVALIDA')
    if (Number(declarado) > TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL) return recusar('LOTE_MUITO_GRANDE')
  }

  const contexto = await resolverContextoTenant(sessao.id, await lerEmpresaAtivaCookie())
  if (contexto.estado !== 'ativo' || !contexto.contexto) return recusar('SEM_PERMISSAO')

  let formulario: FormData
  try {
    const corpo = await lerCorpoLimitado(request, TAMANHO_MAXIMO_REQUISICAO_XML_FISCAL)
    if (corpo === 'excede') return recusar('LOTE_MUITO_GRANDE')
    formulario = await new Response(corpo, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData()
  } catch {
    return recusar('REQUISICAO_INVALIDA')
  }

  const clienteBruto = formulario.get('clienteId')
  let clienteId: string | null = null
  if (clienteBruto !== null && clienteBruto !== '') {
    const validado = ClienteIdSchema.safeParse(clienteBruto)
    if (!validado.success) return recusar('CLIENTE_FORA_DO_ESCOPO')
    clienteId = validado.data
  }

  const entradas = formulario.getAll('arquivos')
  if (entradas.some((entrada) => !(entrada instanceof File))) return recusar('REQUISICAO_INVALIDA')

  const resultado = await receberXmlsFiscais({
    usuarioId: sessao.id,
    empresaId: contexto.contexto.empresaId,
    clienteId,
    arquivos: entradas as File[],
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null,
  })

  if (!resultado.sucesso) return recusar(resultado.codigo)
  return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
}
