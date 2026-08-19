/**
 * Hook de resolução que substitui módulos do Next por stubs locais durante os
 * testes de desenvolvimento. Nenhum código de aplicação é alterado.
 */
const STUBS = {
  'next/headers': new URL('./_stub-next-headers.mjs', import.meta.url).href,
  'next/cache': new URL('./_stub-next-cache.mjs', import.meta.url).href,
}

export async function resolve(especificador, contexto, proximo) {
  const stub = STUBS[especificador]
  if (stub) return { url: stub, shortCircuit: true }
  return proximo(especificador, contexto)
}
