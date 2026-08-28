import 'server-only'

/**
 * O único lugar da Vincis que fala com a API da Daily.
 *
 * ## Por que é um módulo só
 *
 * Porque a `DAILY_API_KEY` é uma credencial de domínio inteiro: quem a tem cria,
 * lê e apaga qualquer sala e emite token para qualquer participante. Espalhar
 * `fetch('https://api.daily.co/...')` por várias Server Actions multiplicaria os
 * lugares onde ela pode escapar num log, num erro repassado ou num header
 * copiado. Aqui ela é lida uma vez, usada dentro de uma função e nunca sai.
 *
 * ## `server-only`
 *
 * A primeira linha faz o build **falhar** se este módulo for importado, mesmo
 * que por engano e por vias transversas, de um Client Component. É a diferença
 * entre confiar que ninguém vai errar e tornar o erro impossível de compilar.
 *
 * ## O que sai daqui
 *
 * Nunca a chave, nunca o header, nunca o corpo bruto da resposta. Falhas viram
 * `ErroDaily`, que carrega um código curto para o log e nada mais. Quem chama
 * transforma isso na frase única que o usuário lê.
 */

import { ErroDaily } from './erros'

const BASE = 'https://api.daily.co/v1'

/**
 * Sete segundos.
 *
 * Uma Server Action que espera indefinidamente por um terceiro trava o clique e
 * segura uma conexão do pool. Sete segundos é folgado para criar sala e emitir
 * token, e curto o bastante para virar "tente de novo" em vez de uma aba
 * parada. `AbortSignal.timeout` já existe no runtime — nenhuma biblioteca nova
 * para uma coisa que a plataforma faz sozinha.
 */
const TIMEOUT_MS = 7_000

function chave(): string {
  const valor = process.env.DAILY_API_KEY
  if (!valor) {
    // A mensagem nomeia a variável — que é pública — e nunca o valor.
    throw new ErroDaily('credencial_ausente', 'DAILY_API_KEY não configurada.')
  }
  return valor
}

type Resposta<T> = { ok: true; dados: T } | { ok: false; status: number; erro: string }

/**
 * Uma chamada à Daily, com timeout e sem vazamento.
 *
 * O corpo de erro é lido para virar um código curto (`already-exists`,
 * `not-found`) e é descartado em seguida: ele pode conter eco do que enviamos,
 * e o que enviamos inclui nomes de participantes.
 */
async function chamar<T>(
  caminho: string,
  init: { metodo: 'GET' | 'POST' | 'DELETE'; corpo?: unknown },
): Promise<Resposta<T>> {
  let resposta: Response
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: init.metodo,
      headers: {
        Authorization: `Bearer ${chave()}`,
        ...(init.corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (erro) {
    // Timeout e queda de rede chegam aqui. `erro` pode conter a URL, mas nunca
    // o header — ainda assim só o nome do tipo atravessa.
    const nome = erro instanceof Error ? erro.name : 'erro'
    throw new ErroDaily(
      nome === 'TimeoutError' ? 'timeout' : 'rede',
      `Falha de comunicação com a Daily (${nome}).`,
    )
  }

  if (resposta.ok) return { ok: true, dados: (await resposta.json()) as T }

  const bruto = await resposta.text().catch(() => '')
  return { ok: false, status: resposta.status, erro: codigoDoErro(bruto) }
}

/**
 * Reduz o corpo de erro a um código conhecido.
 *
 * O texto bruto não é repassado adiante — só a etiqueta que muda a decisão de
 * quem chamou. `desconhecido` é resposta legítima: significa "falhou e não
 * temos o que fazer de especial".
 */
function codigoDoErro(bruto: string): string {
  const texto = bruto.toLowerCase()
  if (texto.includes('already exists') || texto.includes('already-exists')) {
    return 'already-exists'
  }
  if (texto.includes('not found') || texto.includes('not-found')) {
    return 'not-found'
  }
  return 'desconhecido'
}

export type SalaDaily = {
  name: string
  url: string
  privacy: string
}

export type PropriedadesDaSala = {
  nome: string
  /** Unix seconds. A Daily recusa entrada antes disto. */
  nbf: number
  /** Unix seconds. A Daily recusa entrada depois disto e apaga a sala. */
  exp: number
}

/**
 * Cria a sala privada da consultoria.
 *
 * ## As propriedades, e o motivo de cada uma
 *
 * - `privacy: 'private'` — sem token, nem a URL correta entra. É a diferença
 *   entre "link secreto" e "acesso autorizado".
 * - `nbf`/`exp` — a mesma janela que o servidor da Vincis aplica, repetida do
 *   lado da Daily. Se a nossa verificação um dia falhar, a sala ainda recusa; e
 *   o `exp` faz a Daily apagar a sala sozinha, sem varredura nossa.
 * - `eject_at_room_exp` — quem já estava dentro sai no fim da tolerância. Sem
 *   isso, `exp` só barra entradas novas e uma chamada esquecida aberta seguiria
 *   consumindo minutos do plano.
 * - `enable_chat: false` — o chat oficial da consultoria é o do Atendimento,
 *   que fica registrado no protocolo. Um segundo chat que evapora ao fim da
 *   chamada só criaria dois lugares para a mesma conversa.
 * - `enable_knocking: false` — bater na porta é uma segunda via de entrada, e
 *   quem decide quem entra aqui é a Vincis, não quem já está na sala.
 * - `max_participants: 2` — a consultoria é entre duas partes.
 * - `enable_prejoin_ui: false` — a antessala é a própria tela da Vincis, onde a
 *   pessoa acabou de clicar em "Entrar". Uma segunda antessala seria só mais um
 *   botão entre ela e a consulta.
 * - **`enable_recording` não é enviado.** Gravação exige decisão de LGPD,
 *   consentimento e retenção que não foram tomadas — e a propriedade ausente é
 *   o mesmo que desligada.
 */
export async function criarSala(
  propriedades: PropriedadesDaSala,
): Promise<SalaDaily> {
  const resposta = await chamar<SalaDaily>('/rooms', {
    metodo: 'POST',
    corpo: {
      name: propriedades.nome,
      privacy: 'private',
      properties: {
        nbf: propriedades.nbf,
        exp: propriedades.exp,
        eject_at_room_exp: true,
        enable_chat: false,
        enable_knocking: false,
        enable_screenshare: true,
        enable_prejoin_ui: false,
        max_participants: 2,
        lang: 'pt-BR',
      },
    },
  })

  if (resposta.ok) return resposta.dados

  /**
   * A sala já existir **não é falha**.
   *
   * É exatamente o que acontece quando dois participantes clicam junto e o
   * segundo chega com o nome que o primeiro acabou de gravar. O nome já foi
   * decidido pelo banco, então a sala que existe é a certa: basta lê-la.
   */
  if (resposta.erro === 'already-exists') {
    const existente = await obterSala(propriedades.nome)
    if (existente) return existente
  }

  throw new ErroDaily(
    'criar_sala',
    `Daily recusou a criação da sala (status ${resposta.status}, ${resposta.erro}).`,
  )
}

/** A sala, ou `null` quando ela não existe (ou já expirou e foi apagada). */
export async function obterSala(nome: string): Promise<SalaDaily | null> {
  const resposta = await chamar<SalaDaily>(`/rooms/${encodeURIComponent(nome)}`, {
    metodo: 'GET',
  })
  if (resposta.ok) return resposta.dados
  if (resposta.status === 404 || resposta.erro === 'not-found') return null
  throw new ErroDaily(
    'obter_sala',
    `Daily recusou a leitura da sala (status ${resposta.status}, ${resposta.erro}).`,
  )
}

export type PropriedadesDoToken = {
  nomeDaSala: string
  /** O nome que aparece na chamada. Montado pelo servidor, nunca pelo browser. */
  nomeExibido: string
  /** Identificador opaco do participante. Até 36 caracteres, pela Daily. */
  usuarioId: string
  nbf: number
  exp: number
}

/**
 * Emite o token de entrada de **um** participante.
 *
 * ## `room_name` é obrigatório, e não por capricho
 *
 * A própria documentação da Daily avisa: um token sem `room_name` vale para
 * **qualquer** sala do domínio. Emitir assim seria entregar uma chave-mestra a
 * cada clique. Aqui ele é sempre preenchido, e é por isso que o token do
 * Cliente A não abre a sala do Cliente B nem por acidente.
 *
 * ## Por que ninguém é `is_owner`
 *
 * Dono, na Daily, é quem pode admitir gente da antessala e silenciar os outros.
 * Numa consulta entre duas pessoas iguais não há o que administrar — e o
 * Profissional não precisa de poder sobre a câmera do Cliente para atender.
 *
 * `eject_at_token_exp` fecha o círculo: no fim da janela, quem estiver dentro
 * sai. O token não é só uma chave de entrada, é o prazo da visita.
 */
export async function criarTokenDeReuniao(
  propriedades: PropriedadesDoToken,
): Promise<string> {
  const resposta = await chamar<{ token: string }>('/meeting-tokens', {
    metodo: 'POST',
    corpo: {
      properties: {
        room_name: propriedades.nomeDaSala,
        user_name: propriedades.nomeExibido,
        user_id: propriedades.usuarioId,
        nbf: propriedades.nbf,
        exp: propriedades.exp,
        is_owner: false,
        eject_at_token_exp: true,
        enable_screenshare: true,
      },
    },
  })

  if (!resposta.ok) {
    throw new ErroDaily(
      'criar_token',
      `Daily recusou a emissão do token (status ${resposta.status}, ${resposta.erro}).`,
    )
  }
  return resposta.dados.token
}

/**
 * Apaga uma sala. Só a limpeza dos dados de demonstração usa.
 *
 * Devolve `false` quando a sala já não existia — apagar o que não está lá não é
 * erro. O `exp` da sala já faz este trabalho sozinho no uso normal.
 */
export async function apagarSala(nome: string): Promise<boolean> {
  const resposta = await chamar<{ deleted: boolean }>(
    `/rooms/${encodeURIComponent(nome)}`,
    { metodo: 'DELETE' },
  )
  if (resposta.ok) return true
  if (resposta.status === 404 || resposta.erro === 'not-found') return false
  throw new ErroDaily(
    'apagar_sala',
    `Daily recusou a exclusão da sala (status ${resposta.status}, ${resposta.erro}).`,
  )
}
