/**
 * Uma Efí de mentira para a suíte — o único ponto simulado do Pix.
 *
 * Substitui apenas o transporte (`criarCobrancaPixImediata` e
 * `consultarCobrancaPix`, via `vi.mock` em `stubs-next.ts`). Todo o resto —
 * ações, núcleo de cobrança, efeitos, travas e índices únicos — roda de verdade
 * contra o Postgres descartável. O teste decide o que "a Efí" responde:
 * paga, remove, falha ou deixa vencer.
 */

type CobrancaFalsa = {
  txid: string
  valorCentavos: number
  status: 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
  expiraEm: Date
  pix: Array<{ endToEndId: string; txid: string; valorCentavos: number; horario: Date; devolvido: boolean }>
}

const cobrancas = new Map<string, CobrancaFalsa>()
let falharEmissao = false
let emissoes = 0
let consultas = 0

export const efiDeTeste = {
  /** Quantas vezes a Vincis pediu à "Efí" para emitir/consultar. */
  get emissoes() {
    return emissoes
  },
  get consultas() {
    return consultas
  },
  limpar() {
    cobrancas.clear()
    falharEmissao = false
    emissoes = 0
    consultas = 0
  },
  falharProximasEmissoes(falhar: boolean) {
    falharEmissao = falhar
  },
  /** O pagador pagou: a cobrança fica CONCLUIDA com um Pix. */
  pagar(txid: string, { valorCentavos, horario }: { valorCentavos?: number; horario?: Date } = {}) {
    const cobranca = cobrancas.get(txid)
    if (!cobranca) throw new Error(`Cobrança falsa ${txid} não existe.`)
    cobranca.status = 'CONCLUIDA'
    cobranca.pix = [
      {
        endToEndId: `E2E${txid}`.slice(0, 32),
        txid,
        valorCentavos: valorCentavos ?? cobranca.valorCentavos,
        horario: horario ?? new Date(),
        devolvido: false,
      },
    ]
  },
  remover(txid: string) {
    const cobranca = cobrancas.get(txid)
    if (cobranca) cobranca.status = 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
  },
  existe(txid: string) {
    return cobrancas.has(txid)
  },

  // As duas funções que o `vi.mock` entrega no lugar das reais.
  async criarCobrancaPixImediata({
    txid,
    valorCentavos,
    expiracaoSegundos,
  }: {
    txid: string
    valorCentavos: number
    expiracaoSegundos: number
  }) {
    emissoes += 1
    if (falharEmissao) throw new Error('Efí de teste indisponível.')
    // PUT idempotente pelo txid, como a real.
    const existente = cobrancas.get(txid)
    const cobranca = existente ?? {
      txid,
      valorCentavos,
      status: 'ATIVA' as const,
      expiraEm: new Date(Date.now() + expiracaoSegundos * 1000),
      pix: [],
    }
    cobrancas.set(txid, cobranca)
    return {
      txid,
      copiaECola: `00020101021226PIXTESTE${txid}`,
      qrCodeImagem: 'data:image/png;base64,iVBORw0KGgo=',
      expiraEm: cobranca.expiraEm,
    }
  },
  async consultarCobrancaPix(txid: string) {
    consultas += 1
    const cobranca = cobrancas.get(txid)
    if (!cobranca) throw new Error('Cobrança inexistente na Efí de teste.')
    return {
      txid,
      status: cobranca.status,
      valorOriginalCentavos: cobranca.valorCentavos,
      expiraEm: cobranca.expiraEm,
      pix: cobranca.pix,
    }
  },
}
