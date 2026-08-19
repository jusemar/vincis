'use server'

import { z } from 'zod'

const RespostaViaCep = z.object({
  erro: z.boolean().optional(),
  logradouro: z.string().default(''),
  bairro: z.string().default(''),
  localidade: z.string().default(''),
  uf: z.string().default(''),
})

export async function consultarCep(cepInformado: string) {
  const cep = cepInformado.replace(/\D/g, '')
  if (!/^\d{8}$/.test(cep)) return { sucesso: false as const, mensagem: 'Informe um CEP válido com 8 números.' }
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
    if (!resposta.ok) return { sucesso: false as const, mensagem: 'O serviço de CEP está indisponível. Preencha o endereço manualmente ou acesse o suporte.' }
    const dados = RespostaViaCep.safeParse(await resposta.json())
    if (!dados.success) return { sucesso: false as const, mensagem: 'Não foi possível interpretar este CEP. Preencha o endereço manualmente.' }
    if (dados.data.erro) return { sucesso: false as const, mensagem: 'CEP não encontrado. Revise os números informados.' }
    if (!dados.data.localidade || dados.data.uf.length !== 2) return { sucesso: false as const, mensagem: 'O endereço retornado está incompleto. Preencha os dados manualmente.' }
    return { sucesso: true as const, endereco: { cep, logradouro: dados.data.logradouro, bairro: dados.data.bairro, cidade: dados.data.localidade, estado: dados.data.uf } }
  } catch {
    return { sucesso: false as const, mensagem: 'O serviço de CEP está indisponível. Preencha o endereço manualmente ou acesse o suporte.' }
  }
}
