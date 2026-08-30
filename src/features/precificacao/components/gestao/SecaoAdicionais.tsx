'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { salvarAdicionais } from '../../actions/precificacao'
import { centavosParaReais } from '../../lib/conversao'
import { impressaoDaSecao } from '../../lib/impressao'
import type { TabelaPrecificacao } from '../../types/precificacao'
import { LinhaValor, SecaoCard, paraNumero, paraTexto } from './base'

/**
 * Os serviços que o cliente marca por cima do plano.
 *
 * Preço e disponibilidade são editáveis; nome e descrição, não — mudá-los é
 * mexer no que a vitrine promete, e isso é conteúdo, não precificação.
 * Desligar um adicional o tira da vitrine sem apagá-lo: um dia ele volta, e
 * quem já contratou continua com um registro que faz sentido.
 */
export function SecaoAdicionais({ tabela }: { tabela: TabelaPrecificacao }) {
  const router = useRouter()
  const [salvando, iniciar] = useTransition()

  const inicial = useMemo(
    () =>
      Object.fromEntries(
        tabela.adicionais.map((a) => [
          a.codigo,
          {
            valor: paraTexto(centavosParaReais(a.valorMensalCentavos)),
            ativo: a.ativo,
          },
        ]),
      ),
    [tabela],
  )

  const [estado, setEstado] = useState(inicial)
  const alterado = JSON.stringify(estado) !== JSON.stringify(inicial)

  function salvar() {
    const entrada = tabela.adicionais.map((a) => ({
      codigo: a.codigo,
      valorReais: paraNumero(estado[a.codigo]?.valor ?? ''),
      ativo: estado[a.codigo]?.ativo ?? a.ativo,
    }))

    if (entrada.some((a) => Number.isNaN(a.valorReais))) {
      toast.error('Confira os campos: há valores em branco ou inválidos.')
      return
    }

    iniciar(async () => {
      const resultado = await salvarAdicionais({
        impressao: impressaoDaSecao(tabela, 'adicionais'),
        adicionais: entrada,
      })
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem)
        return
      }
      toast.success('Adicionais atualizados.')
      router.refresh()
    })
  }

  return (
    <SecaoCard
      titulo="Serviços adicionais"
      descricao="Itens opcionais que o cliente marca no configurador. Entram pelo valor cheio, sem os acréscimos de ramo, atendimento ou rotina."
      alterado={alterado}
      salvando={salvando}
      onSalvar={salvar}
      onDesfazer={() => setEstado(inicial)}
    >
      {tabela.adicionais.map((adicional) => (
        <div key={adicional.codigo} className="space-y-2">
          <LinhaValor
            id={`adicional-${adicional.codigo}`}
            rotulo={adicional.rotulo}
            ajuda={adicional.descricao}
            unidade="reais"
            valor={estado[adicional.codigo]?.valor ?? ''}
            desabilitado={!estado[adicional.codigo]?.ativo}
            onChange={(valor) =>
              setEstado((atual) => ({
                ...atual,
                [adicional.codigo]: { ...atual[adicional.codigo], valor },
              }))
            }
          />
          <div className="flex items-center gap-2 pl-3">
            <Switch
              id={`ativo-${adicional.codigo}`}
              checked={estado[adicional.codigo]?.ativo ?? true}
              onCheckedChange={(ativo) =>
                setEstado((atual) => ({
                  ...atual,
                  [adicional.codigo]: { ...atual[adicional.codigo], ativo },
                }))
              }
            />
            <Label
              htmlFor={`ativo-${adicional.codigo}`}
              className="text-xs text-muted-foreground"
            >
              {estado[adicional.codigo]?.ativo
                ? 'Disponível na página de preços'
                : 'Fora da página de preços'}
            </Label>
          </div>
        </div>
      ))}
    </SecaoCard>
  )
}
