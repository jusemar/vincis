import { describe, expect, it } from 'vitest'
import {
  montarEnviosDoAtendimento,
  montarEnviosDoConvite,
} from '@/features/atendimentos/lib/difusao'
import { rotaDoDestino } from '@/features/notificacoes/lib/rota-do-destino'
import { deveExibirToast } from '@/features/tempo-real/lib/contexto-ativo'
import {
  canalDoAtendimento,
  canalDoConvite,
  canalDoUsuario,
  interpretarCanal,
} from '@/integracoes/realtime/canais'
import { realtimeConfiguradoNoServidor } from '@/integracoes/realtime/config'
import { montarEvento } from '@/integracoes/realtime/eventos'
import { publicarEventos } from '@/integracoes/realtime/servidor'

const ANA = '11111111-1111-4111-8111-111111111111'
const RICARDO = '22222222-2222-4222-8222-222222222222'
const ATENDIMENTO = '33333333-3333-4333-8333-333333333333'
const CONVITE = '44444444-4444-4444-8444-444444444444'

describe('payload dos eventos', () => {
  /**
   * A regra que sustenta a segurança do tempo real: o canal compartilhado leva
   * "algo mudou"; o texto só vai no canal privado de cada destinatário, que já
   * é o recorte de audiência decidido pelo domínio.
   */
  it('o canal do Atendimento não carrega texto e o pessoal carrega', () => {
    const envios = montarEnviosDoAtendimento({
      tipo: 'mensagem',
      atendimentoId: ATENDIMENTO,
      protocolo: '#2026-0003',
      autorId: ANA,
      destinatarios: [RICARDO],
      titulo: 'Ana enviou uma mensagem no #2026-0003',
      aba: 'conversa',
      canalConversa: 'cliente',
    })

    const pessoal = envios.find((e) => e.canal === canalDoUsuario(RICARDO))
    const doAtendimento = envios.find(
      (e) => e.canal === canalDoAtendimento(ATENDIMENTO),
    )

    expect(pessoal?.evento.titulo).toBe('Ana enviou uma mensagem no #2026-0003')
    expect(doAtendimento?.evento.titulo).toBeUndefined()
    // Nem no canal pessoal o conteúdo da mensagem viaja: só o aviso.
    expect(JSON.stringify(envios)).not.toContain('conteudo')
  })

  it('quem provocou o fato não recebe aviso pessoal dele', () => {
    const envios = montarEnviosDoAtendimento({
      tipo: 'arquivo',
      atendimentoId: ATENDIMENTO,
      protocolo: '#2026-0003',
      autorId: ANA,
      destinatarios: [ANA, RICARDO, RICARDO],
      titulo: 'Novo arquivo no #2026-0003',
      aba: 'arquivos',
    })

    const canais = envios.map((e) => e.canal)
    expect(canais).not.toContain(canalDoUsuario(ANA))
    // E cada pessoa recebe uma vez só, mesmo repetida na audiência.
    expect(canais.filter((c) => c === canalDoUsuario(RICARDO))).toHaveLength(1)
  })

  it('a negociação não passa pelo canal do Atendimento', () => {
    const envios = montarEnviosDoConvite({
      tipo: 'negociacao',
      conviteId: CONVITE,
      atendimentoId: ATENDIMENTO,
      protocolo: '#2026-0003',
      autorId: RICARDO,
      destinatarios: [ANA],
      titulo: 'Ricardo respondeu ao convite do #2026-0003',
    })

    const canais = envios.map((e) => e.canal)
    expect(canais).toContain(canalDoConvite(CONVITE))
    expect(canais).toContain(canalDoUsuario(ANA))
    expect(canais).not.toContain(canalDoAtendimento(ATENDIMENTO))
    // Valor combinado não viaja no evento.
    expect(JSON.stringify(envios)).not.toContain('valor')
  })
})

describe('fallback sem credenciais', () => {
  /**
   * A ausência de Pusher não pode quebrar nada.
   *
   * As variáveis são apagadas dentro do teste, e não deixadas ao acaso do
   * ambiente: assim o cenário "sem credencial" continua sendo exercitado mesmo
   * numa máquina que tenha o `.env` preenchido — que é justamente o caso do
   * desenvolvimento local depois de configurado.
   */
  it('publicar sem Pusher configurado não lança e devolve false', async () => {
    const guardadas = {
      PUSHER_APP_ID: process.env.PUSHER_APP_ID,
      PUSHER_KEY: process.env.PUSHER_KEY,
      PUSHER_SECRET: process.env.PUSHER_SECRET,
      PUSHER_CLUSTER: process.env.PUSHER_CLUSTER,
    }
    for (const chave of Object.keys(guardadas)) delete process.env[chave]

    try {
      expect(realtimeConfiguradoNoServidor()).toBe(false)
      const publicado = await publicarEventos([
        {
          canal: canalDoUsuario(ANA),
          evento: montarEvento({ tipo: 'notificacao', autorId: null }),
        },
      ])
      expect(publicado).toBe(false)
    } finally {
      for (const [chave, valor] of Object.entries(guardadas)) {
        if (valor !== undefined) process.env[chave] = valor
      }
    }
  })
})

describe('toast contextual', () => {
  const evento = montarEvento({
    tipo: 'mensagem',
    autorId: ANA,
    atendimentoId: ATENDIMENTO,
    protocolo: '#2026-0003',
    canalConversa: 'cliente',
    titulo: 'Ana enviou uma mensagem no #2026-0003',
    aba: 'conversa',
  })

  it('fora do Atendimento, avisa', () => {
    expect(
      deveExibirToast({ evento, contexto: null, usuarioId: RICARDO }),
    ).toBe(true)
  })

  it('dentro da Conversa daquele canal, não avisa', () => {
    expect(
      deveExibirToast({
        evento,
        contexto: {
          atendimentoId: ATENDIMENTO,
          aba: 'conversa',
          canalConversa: 'cliente',
        },
        usuarioId: RICARDO,
      }),
    ).toBe(false)
  })

  it('no canal Interno, a mensagem do Cliente ainda merece aviso', () => {
    expect(
      deveExibirToast({
        evento,
        contexto: {
          atendimentoId: ATENDIMENTO,
          aba: 'conversa',
          canalConversa: 'interno',
        },
        usuarioId: RICARDO,
      }),
    ).toBe(true)
  })

  it('nunca avisa a pessoa da própria ação', () => {
    expect(
      deveExibirToast({ evento, contexto: null, usuarioId: ANA }),
    ).toBe(false)
  })

  it('aba escondida não recebe toast', () => {
    expect(
      deveExibirToast({
        evento,
        contexto: null,
        usuarioId: RICARDO,
        abaVisivel: false,
      }),
    ).toBe(false)
  })

  it('evento sem texto não vira toast', () => {
    expect(
      deveExibirToast({
        evento: montarEvento({
          tipo: 'mensagem',
          autorId: ANA,
          atendimentoId: ATENDIMENTO,
        }),
        contexto: null,
        usuarioId: RICARDO,
      }),
    ).toBe(false)
  })

  it('negociação aberta na tela dispensa o aviso; outra negociação não', () => {
    const daNegociacao = montarEvento({
      tipo: 'negociacao',
      autorId: ANA,
      conviteId: CONVITE,
      atendimentoId: ATENDIMENTO,
      protocolo: '#2026-0003',
      titulo: 'Ana respondeu ao convite',
    })
    const contexto = {
      atendimentoId: ATENDIMENTO,
      aba: 'info' as const,
      canalConversa: 'cliente' as const,
      conviteId: CONVITE,
    }

    expect(
      deveExibirToast({ evento: daNegociacao, contexto, usuarioId: RICARDO }),
    ).toBe(false)
    expect(
      deveExibirToast({
        evento: daNegociacao,
        contexto: { ...contexto, conviteId: 'outro' },
        usuarioId: RICARDO,
      }),
    ).toBe(true)
  })

  it('arquivo novo avisa quem está em outra aba do mesmo Atendimento', () => {
    const doArquivo = montarEvento({
      tipo: 'arquivo',
      autorId: ANA,
      atendimentoId: ATENDIMENTO,
      protocolo: '#2026-0003',
      titulo: 'Novo arquivo no #2026-0003',
      aba: 'arquivos',
    })
    expect(
      deveExibirToast({
        evento: doArquivo,
        contexto: {
          atendimentoId: ATENDIMENTO,
          aba: 'conversa',
          canalConversa: 'cliente',
        },
        usuarioId: RICARDO,
      }),
    ).toBe(true)
    expect(
      deveExibirToast({
        evento: doArquivo,
        contexto: {
          atendimentoId: ATENDIMENTO,
          aba: 'arquivos',
          canalConversa: 'cliente',
        },
        usuarioId: RICARDO,
      }),
    ).toBe(false)
  })
})

describe('destino do clique', () => {
  it('mensagem leva à Conversa no canal certo', () => {
    expect(
      rotaDoDestino({
        pagina: 'atendimentos',
        atendimento: '#2026-0003',
        aba: 'conversa',
        canal: 'interno',
      }),
    ).toBe(
      '/admin?pagina=atendimentos&atendimento=%232026-0003&aba=conversa&canal=interno',
    )
  })

  it('convite leva à negociação correspondente', () => {
    expect(rotaDoDestino({ pagina: 'atendimentos', conviteId: CONVITE })).toBe(
      `/admin?pagina=atendimentos&convite=${CONVITE}`,
    )
  })
})

describe('nomes de canal', () => {
  it('ida e volta preservam escopo e id', () => {
    expect(interpretarCanal(canalDoUsuario(ANA))).toEqual({
      escopo: 'usuario',
      id: ANA,
    })
    expect(interpretarCanal(canalDoAtendimento(ATENDIMENTO))).toEqual({
      escopo: 'atendimento',
      id: ATENDIMENTO,
    })
    expect(interpretarCanal(canalDoConvite(CONVITE))).toEqual({
      escopo: 'convite',
      id: CONVITE,
    })
  })
})
