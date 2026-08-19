import { db } from '@/db/connection'
import { atendimentoMensagens } from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import type { EscopoMensagem } from '../constants/atendimento'
import { nomeDoAutor, obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento } from './autorizacao'
import { difundirNoAtendimento } from './difusao'

export const TAMANHO_MAXIMO_MENSAGEM = 4000

export type ResultadoMensagem =
  | { sucesso: true; id: string; escopo: EscopoMensagem }
  | { sucesso: false; motivo: 'sem-acesso' | 'escopo-proibido' | 'vazia' }

/**
 * Envia uma mensagem no Atendimento.
 *
 * A regra que sustenta a privacidade inteira está aqui: o Cliente só escreve —
 * e só lê — no escopo `cliente`. Uma tentativa de gravar no `interno` vindo da
 * conta do Cliente é recusada no servidor, não escondida na interface.
 *
 * O conteúdo é guardado como texto puro. A renderização não interpreta HTML, e
 * por isso nada aqui precisa "limpar" marcação — o que entra é o que a pessoa
 * escreveu.
 */
export async function enviarMensagemNoAtendimento({
  atendimentoId,
  usuarioId,
  escopo,
  conteudo,
}: {
  atendimentoId: string
  usuarioId: string
  escopo: EscopoMensagem
  conteudo: string
}): Promise<ResultadoMensagem> {
  const texto = conteudo.trim().slice(0, TAMANHO_MAXIMO_MENSAGEM)
  if (!texto) return { sucesso: false, motivo: 'vazia' }

  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }
  if (acesso.vinculo === 'cliente' && escopo === 'interno') {
    return { sucesso: false, motivo: 'escopo-proibido' }
  }

  const gravado = await db.transaction(async (tx) => {
    const [mensagem] = await tx
      .insert(atendimentoMensagens)
      .values({ atendimentoId, autorId: usuarioId, escopo, conteudo: texto })
      .returning({ id: atendimentoMensagens.id })

    const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
    if (!audiencia) return { id: mensagem.id, aviso: null }

    const autor = await nomeDoAutor(tx, usuarioId)
    // A fronteira do canal é a fronteira do aviso: nota interna avisa a
    // equipe e para aí. Mandar para `todos` acenderia o sino do Cliente
    // apontando para uma conversa que ele não pode abrir.
    const destinatarios =
      escopo === 'interno' ? audiencia.equipe : audiencia.todos
    const doCliente = acesso.vinculo === 'cliente'
    const titulo = doCliente
      ? `${autor} respondeu no ${audiencia.protocolo}`
      : `${autor} enviou uma mensagem no ${audiencia.protocolo}`

    await emitirNotificacoes(tx, {
      destinatarios,
      autorId: usuarioId,
      tipo: doCliente
        ? TIPOS_NOTIFICACAO.clienteRespondeu
        : TIPOS_NOTIFICACAO.mensagemConversa,
      titulo,
      resumo: resumirTexto(texto),
      recursoTipo: 'atendimento',
      recursoId: atendimentoId,
      atendimentoId,
      protocolo: audiencia.protocolo,
      destino: {
        pagina: 'atendimentos',
        atendimento: audiencia.protocolo,
        aba: 'conversa',
        canal: escopo === 'interno' ? 'interno' : 'cliente',
      },
    })

    return {
      id: mensagem.id,
      aviso: { destinatarios, titulo, protocolo: audiencia.protocolo },
    }
  })

  // Fora da transação, de propósito: a mensagem já está gravada e confirmada
  // quando o aviso sai. É esta ordem que garante que a outra ponta, ao refazer
  // a consulta, encontre a mensagem que o aviso anunciou.
  if (gravado.aviso) {
    await difundirNoAtendimento({
      tipo: 'mensagem',
      atendimentoId,
      protocolo: gravado.aviso.protocolo,
      autorId: usuarioId,
      destinatarios: gravado.aviso.destinatarios,
      titulo: gravado.aviso.titulo,
      aba: 'conversa',
      canalConversa: escopo === 'interno' ? 'interno' : 'cliente',
    })
  }

  return { sucesso: true as const, id: gravado.id, escopo }
}
