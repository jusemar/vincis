/**
 * O pagamento **simulado** ainda pode rodar aqui?
 *
 * Só na suíte de testes. Com o Pix real no lugar, uma Server Action que aprova
 * pagamento sem dinheiro é uma porta para contratar de graça — e Server Action
 * é endpoint público, qualquer um chama à mão. A suíte continua usando o
 * simulador para montar cenários sem falar com a Efí; desenvolvimento local,
 * homologação e produção usam o Pix (sandbox ou real).
 */
export function simulacaoPermitida(ambiente: NodeJS.ProcessEnv = process.env): boolean {
  return ambiente.NODE_ENV === 'test' && ambiente.VERCEL_ENV === undefined
}
