'use server'

import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
import { obterIdentidadePublica } from '@/features/servicos/queries/identidade-publica'
import { MENSAGEM_HORARIO_INDISPONIVEL } from '../constants/contratacao'
import { listarHorariosDoDia } from '../queries/agenda-publica'
import { PrepararContratacaoSchema } from '../schemas/contratacao'
import type { ResultadoPreparacao } from '../types/contratacao'

/**
 * Deixa o Cliente pronto para o pagamento — e não grava nada.
 *
 * ## O que esta ação é
 *
 * O portão entre "escolhi um horário" e "vou pagar". Ela responde uma única
 * pergunta — *este Cliente pode seguir para o pagamento desta consultoria,
 * agora?* — e devolve o resumo **recalculado no servidor**. Nenhuma linha é
 * escrita aqui: não há contratação, não há reserva, não há Atendimento, não há
 * protocolo. Selecionar não tira o horário de ninguém, e ir para o login
 * tampouco — só `reservarHorarioDaConsultoria` prende horário, e ela usa esta
 * função como porta de entrada em vez de repetir a validação.
 *
 * ## Por que o resumo vem daqui, e não do navegador
 *
 * O card já tem preço, duração e título na tela — e nada disso é aceito de
 * volta. O que chega do navegador é só *quem*, *qual dia* e *qual hora*; o
 * resto é relido da configuração do Profissional. Aceitar `valorCentavos` do
 * cliente seria o mesmo que publicar um formulário onde o preço é campo
 * editável.
 *
 * ## Por que existem tantas situações de recusa
 *
 * Porque cada uma pede uma conversa diferente com quem está do outro lado:
 * "entre na sua conta" para quem não tem sessão, "confirme seu e-mail" para
 * quem tem sessão e conta pendente, "escolha outro horário" para quem demorou
 * demais. Um `false` genérico obrigaria a tela a adivinhar — e adivinhar
 * errado é mandar quem já está logado fazer login de novo. A distinção é só de
 * **mensagem**: quem autoriza continua sendo `obterSessaoServidor`, a mesma
 * definição de conta apta que o login e o middleware aplicam.
 */
export async function prepararContratacaoConsultoria(
  entrada: unknown,
): Promise<ResultadoPreparacao> {
  const validacao = PrepararContratacaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      situacao: 'dados_invalidos',
      mensagem:
        validacao.error.issues[0]?.message ?? 'Revise os dados da consultoria.',
    }
  }
  const { prestadorId, data, inicio, descricao } = validacao.data

  const sessao = await obterSessaoServidor()
  if (!sessao) {
    // A sessão não foi aceita — falta saber por quê, para não mandar alguém que
    // já entrou entrar de novo.
    const estado = await obterEstadoDaContaDaSessao()
    if (estado === 'nao_confirmada') {
      return {
        situacao: 'conta_nao_confirmada',
        mensagem:
          'Confirme sua conta para continuar. Enviamos um link de confirmação para você.',
      }
    }
    if (estado === 'bloqueada') {
      return {
        situacao: 'conta_bloqueada',
        mensagem:
          'Sua conta está bloqueada. Fale com o suporte para voltar a contratar.',
      }
    }
    return {
      situacao: 'precisa_entrar',
      mensagem: 'Entre na sua conta para continuar.',
    }
  }

  // Contratar é ato de Cliente — a mesma regra que `contratarServico` já
  // aplica, pela mesma função. Profissional e Colaborador são recusados aqui,
  // no servidor, e não apenas no botão.
  if (!podeAgirComoCliente(sessao)) {
    return {
      situacao: 'perfil_nao_pode_contratar',
      mensagem: 'Apenas contas de Cliente podem contratar consultorias.',
    }
  }

  if (prestadorId === sessao.id) {
    return {
      situacao: 'perfil_nao_pode_contratar',
      mensagem: 'Você não pode contratar a própria consultoria.',
    }
  }

  // Mesma porta pública que o perfil usa: conta ativa, verificada e cadastro
  // habilitado. Um Profissional que saiu do ar não volta a ser contratável por
  // um modal que ficou aberto.
  const identidade = await obterIdentidadePublica(prestadorId)
  if (!identidade) {
    return {
      situacao: 'horario_indisponivel',
      mensagem: MENSAGEM_HORARIO_INDISPONIVEL,
    }
  }

  /**
   * A revalidação propriamente dita.
   *
   * Recalcula o dia inteiro com a regra de sempre — recorrência, exceções,
   * antecedência mínima, horizonte — e procura o horário escolhido no
   * resultado. Não existe atalho tipo "confia no que o card mandou": entre
   * abrir o modal e clicar em continuar cabem um bloqueio parcial novo, uma
   * consultoria desativada e a própria passagem do tempo empurrando o horário
   * para dentro da antecedência mínima.
   */
  const agenda = await listarHorariosDoDia({
    prestadorId,
    data,
    // A reserva do próprio Cliente não pode ser o motivo de recusá-lo: quem já
    // segura o horário precisa conseguir voltar ao fluxo, atualizar a página e
    // seguir para o pagamento. Reservas de terceiros continuam ocupando.
    ignorarClienteId: sessao.id,
  })
  const consultoria = agenda.consultoria
  const horario = agenda.horarios.find((slot) => slot.inicio === inicio)

  if (!consultoria || !horario) {
    return {
      situacao: 'horario_indisponivel',
      mensagem: MENSAGEM_HORARIO_INDISPONIVEL,
    }
  }

  return {
    situacao: 'pronto',
    resumo: {
      prestadorId,
      prestadorNome: identidade.nome,
      consultoriaId: consultoria.id,
      titulo: consultoria.titulo,
      modalidade: consultoria.modalidade,
      data,
      inicio: horario.inicio,
      fim: horario.fim,
      inicioEm: horario.inicioEm,
      fimEm: horario.fimEm,
      timezone: consultoria.timezone,
      // Preço e duração vêm da configuração lida agora — nunca do navegador.
      duracaoMinutos: consultoria.duracaoMinutos,
      valorCentavos: consultoria.valorCentavos,
      // Devolvido só para a tela reexibir o que a pessoa escreveu. Nada é
      // gravado nesta etapa: a descrição vive no navegador até o Atendimento
      // existir, e o Atendimento é de outra etapa.
      descricao,
      clienteNome: sessao.nome,
    },
  }
}
