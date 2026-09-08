import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { configuracoesPlataforma, parceiroPrazos } from '@/db/schema'
import { CHAVE_PRAZO_PARCEIRO, CONFIGURACOES } from '@/features/configuracoes/lib/configuracoes'
import {
  PRAZO_MAXIMO_DIAS,
  PRAZO_MINIMO_DIAS,
  type PrazoVigente,
} from '../constants/prazo'

/** O ponto de partida embutido, quando nada foi configurado nem é legível. */
const PADRAO_EMBUTIDO = CONFIGURACOES[CHAVE_PRAZO_PARCEIRO].padrao

/** Executor: aceita o banco ou a transação em curso. */
type Executor = Pick<typeof db, 'select'>

function dentroDosLimites(valor: number | null | undefined): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) return null
  return valor >= PRAZO_MINIMO_DIAS && valor <= PRAZO_MAXIMO_DIAS ? valor : null
}

/**
 * O prazo que vale agora para um serviço.
 *
 * ## Por que não usa `lerNumero`
 *
 * O leitor de `features/configuracoes` **lança** quando o valor guardado é
 * ilegível — decisão deliberada de `/precos`, onde exibir preço em que não se
 * pode confiar é pior do que não exibir preço nenhum. Aqui a consequência seria
 * outra: esta função roda dentro da criação de oportunidade, e uma linha
 * corrompida em `configuracoes_plataforma` passaria a derrubar a solicitação de
 * orçamento de quem nunca ouviu falar do programa de parceiros.
 *
 * Então a leitura é tolerante e em cascata — serviço, padrão da Gestão, padrão
 * embutido —, e cada degrau ignorado é registrado no log. O que se perde é
 * exatidão de um prazo acessório; o que se preserva é um fluxo crítico.
 *
 * ## Cascata
 *
 * 1. `parceiro_prazos` da referência, quando a Gestão configurou aquele
 *    serviço;
 * 2. o padrão global de `configuracoes_plataforma`;
 * 3. o padrão embutido, para que a plataforma funcione antes de a Gestão abrir
 *    a tela pela primeira vez.
 */
export async function obterPrazoVigente(
  referencia: string | null,
  executor: Executor = db,
): Promise<PrazoVigente> {
  if (referencia) {
    try {
      const [linha] = await executor
        .select({ dias: parceiroPrazos.dias })
        .from(parceiroPrazos)
        .where(eq(parceiroPrazos.referencia, referencia))
        .limit(1)

      const dias = dentroDosLimites(linha?.dias)
      if (dias) return { dias, origem: 'servico' }
      if (linha) {
        console.error('[PARCEIROS] prazo do serviço fora dos limites', {
          referencia,
          guardado: linha.dias,
        })
      }
    } catch (erro) {
      console.error('[PARCEIROS] falha ao ler prazo do serviço', {
        referencia,
        mensagem: erro instanceof Error ? erro.message : undefined,
      })
    }
  }

  try {
    const [linha] = await executor
      .select({ valor: configuracoesPlataforma.valor })
      .from(configuracoesPlataforma)
      .where(eq(configuracoesPlataforma.chave, CHAVE_PRAZO_PARCEIRO))
      .limit(1)

    const bruto = (linha?.valor ?? '').trim()
    if (bruto !== '') {
      const dias = dentroDosLimites(Number.parseInt(bruto, 10))
      if (dias) return { dias, origem: 'padrao' }
      console.error('[PARCEIROS] prazo padrão ilegível ou fora dos limites', {
        guardado: bruto,
      })
    }
  } catch (erro) {
    console.error('[PARCEIROS] falha ao ler prazo padrão', {
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
  }

  return { dias: PADRAO_EMBUTIDO, origem: 'embutido' }
}

/** Os prazos configurados hoje, para a tela do Gestor. */
export async function listarPrazosConfigurados() {
  const linhas = await db
    .select({
      referencia: parceiroPrazos.referencia,
      dias: parceiroPrazos.dias,
      atualizadoEm: parceiroPrazos.updatedAt,
    })
    .from(parceiroPrazos)
  return new Map(linhas.map((linha) => [linha.referencia, linha]))
}
