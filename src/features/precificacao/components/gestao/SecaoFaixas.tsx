'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { salvarFaixas } from '../../actions/precificacao'
import { centavosParaReais } from '../../lib/conversao'
import { impressaoDaSecao } from '../../lib/impressao'
import type {
  FaixaPrecificacao,
  TabelaPrecificacao,
} from '../../types/precificacao'
import { LinhaValor, SecaoCard, paraNumero, paraTexto } from './base'

/**
 * Os acréscimos que dependem do porte da empresa.
 *
 * O que o Gestor vê é o rótulo comercial da faixa — "11 a 30", "Até R$ 50
 * mil" — e o quanto ela acrescenta. Os limites que o motor compara não
 * aparecem: são a mesma informação escrita em número, e editá-los é o único
 * jeito de abrir um buraco na grade. Quando isso for necessário, será uma tela
 * própria, com a validação de faixas contíguas na frente.
 */
export function SecaoFaixas({
  tabela,
  tipo,
  titulo,
  descricao,
  rodape,
  rotulo,
}: {
  tabela: TabelaPrecificacao
  tipo: 'funcionarios' | 'notas_fiscais' | 'faturamento'
  titulo: string
  descricao: string
  rodape?: string
  /** Como cada faixa é apresentada. Funcionários lê diferente das outras. */
  rotulo: (faixa: FaixaPrecificacao) => { rotulo: string; ajuda?: string }
}) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()

  const faixas = useMemo(
    () =>
      tabela.faixas
        .filter((f) => f.tipo === tipo)
        .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.limiteMin - b.limiteMin),
    [tabela, tipo],
  )

  const inicial = useMemo(
    () =>
      Object.fromEntries(
        faixas.map((f) => [
          `${f.grupo}/${f.codigo}`,
          paraTexto(centavosParaReais(f.valorCentavos)),
        ]),
      ),
    [faixas],
  )

  const [valores, setValores] = useState(inicial)
  const alterado = JSON.stringify(valores) !== JSON.stringify(inicial)

  function salvar() {
    const entrada = faixas.map((f) => ({
      grupo: f.grupo,
      codigo: f.codigo,
      valorReais: paraNumero(valores[`${f.grupo}/${f.codigo}`] ?? ''),
    }))

    if (entrada.some((f) => Number.isNaN(f.valorReais))) {
      toast.error('Confira os campos: há valores em branco ou inválidos.')
      return
    }

    iniciar(async () => {
      const resultado = await salvarFaixas({
        impressao: impressaoDaSecao(tabela, tipo),
        tipo,
        faixas: entrada,
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
      {faixas.map((faixa) => {
        const chave = `${faixa.grupo}/${faixa.codigo}`
        const texto = rotulo(faixa)
        return (
          <LinhaValor
            key={chave}
            id={`faixa-${tipo}-${chave}`}
            rotulo={texto.rotulo}
            ajuda={texto.ajuda}
            unidade="reais"
            valor={valores[chave] ?? ''}
            onChange={(valor) =>
              setValores((atual) => ({ ...atual, [chave]: valor }))
            }
          />
        )
      })}
    </SecaoCard>
  )
}

/** "contabil" e "juridico" ditos como o Gestor os chama. */
export function nomeDoGrupo(grupo: string) {
  return grupo === 'juridico' ? 'Assistência Jurídica' : 'Contabilidade'
}
