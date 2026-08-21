'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { oportunidadeArquivos, oportunidades } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { obterPrazoOportunidadeHoras } from '@/features/configuracoes/queries/obter-configuracao'
import { resumirTexto } from '@/features/notificacoes/lib/emitir'
import type { AnexoEnviado } from '@/lib/anexos-privados'
import { SEM_AUTORIZACAO_COM_DADOS } from '@/features/usuarios/constants/autorizacao'
import { PERFIL_GESTOR_VINCIS } from '@/features/usuarios/constants/perfis'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { tipoPrestadorDoPerfil } from '@/features/usuarios/lib/tipos-pessoa'
import type { CategoriaOportunidade } from '../constants/oportunidade'
import { enviarAnexoDaOportunidade, validarAnexosDaOportunidade } from '../lib/arquivo-oportunidade'
import {
  avisarEmTempoReal,
  destinatariosDaOportunidade,
  difundirOportunidade,
} from '../lib/difundir-oportunidade'
import { expirarOportunidadesVencidas } from '../lib/vigencia-sql'
import { listarOportunidadesDoCliente } from '../queries/listar-oportunidades-do-cliente'
import {
  converterValorParaCentavos,
  lerAnexosDaOportunidade,
  lerNovaOportunidade,
} from '../schemas/oportunidade'

/** Texto único da recusa por conta ainda não confirmada. */
const CONTA_NAO_CONFIRMADA =
  'Sua conta ainda não foi confirmada. Confirme pelo link enviado ao seu e-mail ou fale com a Vincis pelo WhatsApp cadastrado para poder solicitar propostas.'

const PRECISA_ENTRAR =
  'Entre ou crie sua conta para enviar a solicitação. Após a confirmação da conta, você poderá solicitar propostas aos profissionais.'

/**
 * Publica uma solicitação pública de orçamento.
 *
 * Três portas, todas no servidor e nesta ordem:
 *
 * 1. **sessão válida** — e sessão válida, nesta plataforma, já significa conta
 *    confirmada: `obterSessaoServidor` aplica a mesma condição de verificação
 *    que o login e o middleware. Quem cadastrou e não confirmou não passa, e o
 *    motivo exato só é consultado para escolher a mensagem;
 * 2. **ser Cliente** — prestador e Gestor são recusados aqui, como já acontece
 *    na contratação direta. Esconder o botão nunca foi proteção;
 * 3. **dados válidos** — categoria e especialidades vêm do vocabulário fechado
 *    da taxonomia profissional, e abrangência de `BR` + UFs.
 *
 * Os anexos são validados **antes** de qualquer gravação e enviados ao
 * armazenamento privado antes da transação, com o id da oportunidade já
 * sorteado. Assim a linha e os anexos nascem juntos: uma solicitação não chega
 * a existir com metade dos arquivos que o Cliente escolheu.
 */
export async function criarOportunidade(formData: FormData) {
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    return {
      sucesso: false as const,
      mensagem:
        estado === 'nao_confirmada' ? CONTA_NAO_CONFIRMADA : PRECISA_ENTRAR,
      precisaEntrar: estado !== 'nao_confirmada',
      contaNaoConfirmada: estado === 'nao_confirmada',
    }
  }

  if (
    sessao.perfilTipo === PERFIL_GESTOR_VINCIS ||
    tipoPrestadorDoPerfil(sessao.perfilTipo)
  ) {
    return {
      sucesso: false as const,
      mensagem: 'Apenas contas de Cliente podem solicitar orçamentos.',
      precisaEntrar: false,
      contaNaoConfirmada: false,
    }
  }

  const validacao = lerNovaOportunidade(formData)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? 'Dados da solicitação inválidos.',
      precisaEntrar: false,
      contaNaoConfirmada: false,
    }
  }

  const anexos = lerAnexosDaOportunidade(formData)
  if (!anexos.sucesso) {
    return {
      sucesso: false as const,
      mensagem: anexos.mensagem,
      precisaEntrar: false,
      contaNaoConfirmada: false,
    }
  }

  const dados = validacao.data
  // O título é derivado da própria descrição: pedir um "assunto" separado
  // acrescentaria um campo ao formulário que existe justamente para quem ainda
  // não sabe nomear o que precisa.
  const titulo = resumirTexto(dados.descricao, 120)
  // O schema já recusou "0" e negativos; aqui `0` só pode vir de campo vazio
  // normalizado, e vira nulo — a coluna guarda ausência, nunca zero.
  const valorPretendidoCentavos =
    converterValorParaCentavos(dados.valorPretendido) || null

  try {
    validarAnexosDaOportunidade(anexos.arquivos)
  } catch (erro) {
    return {
      sucesso: false as const,
      mensagem:
        erro instanceof Error ? erro.message : 'Anexo inválido.',
      precisaEntrar: false,
      contaNaoConfirmada: false,
    }
  }

  // O prazo global vem da configuração da Gestão e é **congelado** aqui: mudar
  // a configuração depois não pode encurtar nem prolongar uma negociação que já
  // começou.
  const prazoHoras = await obterPrazoOportunidadeHoras()
  const expiraEm = new Date(Date.now() + prazoHoras * 60 * 60 * 1000)

  const oportunidadeId = randomUUID()

  try {
    const enviados: AnexoEnviado[] = []
    for (const arquivo of anexos.arquivos) {
      enviados.push(await enviarAnexoDaOportunidade(oportunidadeId, arquivo))
    }

    const avisados = await db.transaction(async (tx) => {
      await tx.insert(oportunidades).values({
        id: oportunidadeId,
        clienteUsuarioId: sessao.id,
        categoria: dados.categoria,
        especialidades: dados.especialidades,
        titulo,
        descricao: dados.descricao,
        abrangencia: dados.abrangencia,
        valorPretendidoCentavos,
        expiraEm,
      })

      if (enviados.length) {
        await tx.insert(oportunidadeArquivos).values(
          enviados.map((arquivo) => ({
            oportunidadeId,
            nome: arquivo.nome,
            tipoMime: arquivo.tipoMime,
            tamanhoBytes: arquivo.tamanhoBytes,
            remetenteId: sessao.id,
            chave: arquivo.chave,
          })),
        )
      }

      const destinatarios = await destinatariosDaOportunidade(
        tx,
        dados.categoria as CategoriaOportunidade,
      )
      await difundirOportunidade(
        tx,
        {
          id: oportunidadeId,
          categoria: dados.categoria as CategoriaOportunidade,
          titulo,
          abrangencia: dados.abrangencia,
        },
        destinatarios,
      )

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.oportunidadeCriada,
          entidade: 'oportunidades',
          registroAfetado: oportunidadeId,
          autorId: sessao.id,
          usuarioId: sessao.id,
          origem: 'admin',
          metadados: {
            categoria: dados.categoria,
            abrangencia: dados.abrangencia,
            anexos: enviados.length,
          },
        },
        tx,
      )

      return destinatarios
    })

    // Depois do commit: quem receber e recarregar encontra a solicitação
    // pronta para ler.
    await avisarEmTempoReal({
      destinatarios: avisados,
      titulo: 'Nova oportunidade disponível para você',
      oportunidadeId,
    })

    revalidatePath('/cliente')
    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem:
        'Solicitação enviada. Profissionais da categoria vão receber sua necessidade.',
      precisaEntrar: false,
      contaNaoConfirmada: false,
      dados: { oportunidadeId },
    }
  } catch (error) {
    console.error('[CRIAR_OPORTUNIDADE]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar sua solicitação. Tente novamente.',
      precisaEntrar: false,
      contaNaoConfirmada: false,
    }
  }
}

/** As solicitações da pessoa logada, com as propostas que ela já recebeu. */
export async function carregarMinhasOportunidades() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return SEM_AUTORIZACAO_COM_DADOS

  // Materializa o vencimento antes de ler. É um UPDATE idempotente que só
  // alcança linhas já vencidas — a corretude não depende dele (as consultas já
  // tratam vencida como fora do ar), mas sem agendador é aqui que a coluna
  // acompanha o relógio.
  await expirarOportunidadesVencidas()

  return {
    sucesso: true as const,
    mensagem: 'Solicitações carregadas.',
    dados: await listarOportunidadesDoCliente(sessao.id),
  }
}
