'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarFatores } from '../../actions/precificacao'
import { acrescimoPercentual } from '../../lib/conversao'
import { impressaoDaSecao } from '../../lib/impressao'
import type { TabelaPrecificacao } from '../../types/precificacao'
import { LinhaValor, SecaoCard, paraNumero, paraTexto } from './base'

/**
 * Os acréscimos percentuais de uma pergunta do configurador.
 *
 * O banco guarda um fator (1,080×); a tela pergunta "quanto a mais?" e mostra
 * 8. Zero é resposta legítima e aparece como tal — "Sem acréscimo" fica no
 * texto de apoio, para que a opção neutra não pareça um campo esquecido.
 */
export function SecaoFatores({
  tabela,
  dimensao,
  titulo,
  descricao,
  rodape,
}: {
  tabela: TabelaPrecificacao
  dimensao: 'atividade' | 'atendimento' | 'rotina'
  titulo: string
  descricao: string
  rodape?: string
}) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()

  const opcoes = useMemo(
    () =>
      (tabela.dimensoes.find((d) => d.codigo === dimensao)?.opcoes ?? []).filter(
        (o) => o.multiplicadorMilesimos !== null,
      ),
    [tabela, dimensao],
  )

  const inicial = useMemo(
    () =>
      Object.fromEntries(
        opcoes.map((o) => [
          o.codigo,
          paraTexto(acrescimoPercentual(o.multiplicadorMilesimos ?? 1000)),
        ]),
      ),
    [opcoes],
  )

  const [valores, setValores] = useState(inicial)
  const alterado = JSON.stringify(valores) !== JSON.stringify(inicial)

  function salvar() {
    const entrada = opcoes.map((o) => ({
      codigo: o.codigo,
      acrescimoPercentual: paraNumero(valores[o.codigo] ?? ''),
    }))

    if (entrada.some((o) => Number.isNaN(o.acrescimoPercentual))) {
      toast.error('Confira os campos: há porcentagens em branco ou inválidas.')
      return
    }

    iniciar(async () => {
      const resultado = await salvarFatores({
        impressao: impressaoDaSecao(tabela, `fatores:${dimensao}`),
        dimensao,
        opcoes: entrada,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success('Alterações salvas.')
      router.refresh()
    })
  }

  return (
    <SecaoCard
      titulo={titulo}
      descricao={descricao}
      rodape={rodape}
      alterado={alterado}
      salvando={salvando}
      onSalvar={salvar}
      onDesfazer={() => setValores(inicial)}
    >
      {opcoes.map((opcao) => (
        <LinhaValor
          key={opcao.codigo}
          id={`fator-${dimensao}-${opcao.codigo}`}
          rotulo={opcao.rotulo}
          ajuda={
            paraNumero(valores[opcao.codigo] ?? '') === 0
              ? 'Sem acréscimo sobre o preço da rotina.'
              : (opcao.ajuda ?? undefined)
          }
          unidade="porcento"
          valor={valores[opcao.codigo] ?? ''}
          onChange={(valor) =>
            setValores((atual) => ({ ...atual, [opcao.codigo]: valor }))
          }
        />
      ))}
    </SecaoCard>
  )
}
