import { db } from '@/db/connection'
import { atendimentoArquivos, atendimentoEventos, usuarios } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes } from '@/features/notificacoes/lib/emitir'
import { TIPOS_EVENTO_ATENDIMENTO } from '../constants/atendimento'
import type { OrigemArquivo } from '../constants/atendimento'
import { obterAudienciaDoAtendimento } from './audiencia'
import { enviarArquivoAtendimento } from './arquivo-atendimento'
import { obterAcessoAtendimento } from './autorizacao'
import { difundirNoAtendimento } from './difusao'

export type ArquivoAnexado = {
  id: string
  nome: string
  tamanhoBytes: number
  origem: OrigemArquivo
}

/**
 * Anexa um arquivo real a um Atendimento.
 *
 * O acesso é conferido antes de qualquer byte subir: quem não tem vínculo com o
 * Atendimento não consegue nem escrever no armazenamento. A `origem` é
 * **derivada** do vínculo de quem envia — se viesse da requisição, um prestador
 * poderia assinar o anexo como se fosse o Cliente.
 *
 * O upload acontece antes da transação de propósito: gravar a linha e só então
 * descobrir que o armazenamento recusou deixaria um anexo fantasma na aba
 * Arquivos.
 */
export async function anexarArquivoNoAtendimento({
  atendimentoId,
  usuarioId,
  arquivo,
}: {
  atendimentoId: string
  usuarioId: string
  arquivo: File
}): Promise<ArquivoAnexado> {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) {
    throw new Error('Você não tem autorização para anexar neste atendimento.')
  }

  const origem: OrigemArquivo = acesso.vinculo === 'cliente' ? 'cliente' : 'prestador'
  const enviado = await enviarArquivoAtendimento(atendimentoId, arquivo)

  const [remetente] = await db
    .select({ nome: usuarios.nome, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)

  const gravado = await db.transaction(async (tx) => {
    let aviso: { destinatarios: string[]; protocolo: string } | null = null
    let titulo = ''
    const [registro] = await tx
      .insert(atendimentoArquivos)
      .values({
        atendimentoId,
        nome: enviado.nome,
        tipoMime: enviado.tipoMime,
        tamanhoBytes: enviado.tamanhoBytes,
        origem,
        remetenteId: usuarioId,
        chave: enviado.chave,
      })
      .returning({ id: atendimentoArquivos.id })

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.arquivoAnexado,
      descricao: `${remetente?.nome ?? 'Participante'} anexou ${enviado.nome}`,
      autorId: usuarioId,
      metadados: { arquivoId: registro.id, origem },
    })

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.arquivoAnexadoAoAtendimento,
        entidade: 'atendimento_arquivos',
        registroAfetado: registro.id,
        autorId: usuarioId,
        empresaId: remetente?.empresaId ?? null,
        origem: origem === 'cliente' ? 'sistema' : 'admin',
        metadados: { atendimentoId, tipoMime: enviado.tipoMime },
      },
      tx,
    )

    const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
    if (audiencia) {
      titulo = `Novo arquivo no ${audiencia.protocolo}`
      aviso = {
        destinatarios: audiencia.todos,
        protocolo: audiencia.protocolo,
      }
      await emitirNotificacoes(tx, {
        // Arquivo do Atendimento é da equipe e do Cliente: os dois lados
        // trocam documento por ali, e a aba Arquivos é comum aos dois.
        destinatarios: audiencia.todos,
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.arquivoRecebido,
        titulo,
        resumo: `${remetente?.nome ?? 'Participante'} anexou ${enviado.nome}`,
        recursoTipo: 'atendimento',
        recursoId: atendimentoId,
        atendimentoId,
        protocolo: audiencia.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: audiencia.protocolo,
          aba: 'arquivos',
        },
      })
    }

    return {
      id: registro.id,
      nome: enviado.nome,
      tamanhoBytes: enviado.tamanhoBytes,
      origem,
      aviso,
      titulo,
    }
  })

  // O arquivo já está no armazenamento e a linha já está confirmada quando o
  // aviso sai: quem receber e recarregar encontra o anexo pronto para baixar.
  if (gravado.aviso) {
    await difundirNoAtendimento({
      tipo: 'arquivo',
      atendimentoId,
      protocolo: gravado.aviso.protocolo,
      autorId: usuarioId,
      destinatarios: gravado.aviso.destinatarios,
      titulo: gravado.titulo,
      aba: 'arquivos',
    })
  }

  return {
    id: gravado.id,
    nome: gravado.nome,
    tamanhoBytes: gravado.tamanhoBytes,
    origem: gravado.origem,
  }
}
