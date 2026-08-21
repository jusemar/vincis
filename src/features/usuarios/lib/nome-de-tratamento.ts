/**
 * Como chamar a pessoa pelo nome, sem perder o tratamento nem inventar um.
 *
 * O nome cadastrado costuma vir com o tratamento junto ("Dr. Ricardo Mendes",
 * "Dra. Ana Carolina Silva"). Pegar a primeira palavra — que era o que a
 * saudação do Dashboard fazia — produzia "Olá, Dr.!": tratamento sem pessoa.
 *
 * Aqui o tratamento é **reconhecido**, nunca deduzido: só é usado o que a
 * própria pessoa gravou no nome. Nada é inferido de gênero, e um nome sem
 * tratamento continua sem tratamento.
 */

const TRATAMENTOS = new Set([
  'dr',
  'dr.',
  'dra',
  'dra.',
  'sr',
  'sr.',
  'sra',
  'sra.',
])

export type SaudacaoNome = {
  /** "Dr. Ricardo", "Ana" — o que vai depois de "Olá,". */
  tratamentoComNome: string | null
  /** Só o primeiro nome real, sem tratamento. */
  primeiroNome: string | null
}

export function separarNomeDeTratamento(nome: string | null | undefined): SaudacaoNome {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  const tratamentos: string[] = []

  let indice = 0
  while (indice < partes.length && TRATAMENTOS.has(partes[indice].toLowerCase())) {
    tratamentos.push(partes[indice])
    indice += 1
  }

  const primeiroNome = partes[indice] ?? null
  if (!primeiroNome) {
    // Nome só com tratamento (ou vazio) não vira saudação: "Olá, Dr.!" é pior
    // do que "Olá!".
    return { tratamentoComNome: null, primeiroNome: null }
  }

  return {
    tratamentoComNome: [...tratamentos, primeiroNome].join(' '),
    primeiroNome,
  }
}

/** Texto pronto da saudação, com o fallback seguro embutido. */
export function saudacaoDeBoasVindas(nome: string | null | undefined) {
  const { tratamentoComNome } = separarNomeDeTratamento(nome)
  return tratamentoComNome ? `Olá, ${tratamentoComNome}!` : 'Olá!'
}
