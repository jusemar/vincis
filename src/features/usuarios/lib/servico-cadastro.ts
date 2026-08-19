import { CadastroUsuarioSchema, type CadastroUsuarioDTO } from '../schemas/cadastro'
import type { ResultadoPadrao, DadosToken } from '../types'

export type ResultadoCadastro = ResultadoPadrao & {
  dados?: DadosToken
}

export async function serviceCadastrarUsuario(dados: CadastroUsuarioDTO): Promise<ResultadoCadastro> {
  const validated = CadastroUsuarioSchema.safeParse(dados)

  if (!validated.success) {
    const erros = validated.error.flatten().fieldErrors
    const primeiraMensagem = Object.values(erros).flat()[0]
    return {
      sucesso: false,
      mensagem: primeiraMensagem || 'Dados inválidos',
    }
  }

  const expiraEm = new Date()
  expiraEm.setHours(expiraEm.getHours() + 48)

  return {
    sucesso: true,
    mensagem: 'Cadastro realizado com sucesso. Verifique seu e-mail para ativar sua conta.',
    dados: {
      token: crypto.randomUUID(),
      expiraEm,
    },
  }
}
