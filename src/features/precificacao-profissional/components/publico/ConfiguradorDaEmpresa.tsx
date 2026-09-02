'use client'

import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampoEnquadramento } from '@/features/precos/components/configurador/CampoEnquadramento'
import { CampoFaturamento } from '@/features/precos/components/configurador/CampoFaturamento'
import { CampoNotasFiscais } from '@/features/precos/components/configurador/CampoNotasFiscais'
import { CampoRamo } from '@/features/precos/components/configurador/CampoRamo'
import { OpcaoCard } from '@/features/precos/components/configurador/OpcaoCard'
import { Stepper } from '@/features/precos/components/configurador/Stepper'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { GRUPO_DO_PROFISSIONAL } from '../../constants/precificacao-profissional'

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
      {children}
    </div>
  )
}

/**
 * As perguntas sobre a empresa, na página de um Profissional.
 *
 * ## O que veio de `/precos` sem ser copiado
 *
 * Os campos. `CampoEnquadramento`, `CampoRamo`, `CampoNotasFiscais`,
 * `CampoFaturamento`, `OpcaoCard` e `Stepper` são importados de
 * `features/precos/components/configurador` **sem nenhuma alteração** — eles já
 * recebem opções e faixas como propriedade e não sabem de que tabela vieram.
 * Reescrever versões próprias faria a mesma pergunta ter dois desenhos, e um
 * deles envelheceria.
 *
 * ## O que ficou de fora, e por quê
 *
 * O `Configurador` de `/precos` traz um campo a mais: adicionais. Ele não
 * aparece aqui porque a tabela do Profissional não tem adicional nenhum — não é
 * um campo escondido, é uma lista vazia. Pelo mesmo motivo não há seletor de
 * tipo de serviço acima do formulário: existe uma pergunta só a fazer.
 */
export function ConfiguradorDaEmpresa({
  tabela,
  respostas,
  onChange,
  compacto = false,
}: {
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
  onChange: (r: RespostasPrecificacao) => void
  /** Na prévia do painel o bloco vive numa coluna estreita. */
  compacto?: boolean
}) {
  const set = <K extends keyof RespostasPrecificacao>(
    chave: K,
    valor: RespostasPrecificacao[K],
  ) => onChange({ ...respostas, [chave]: valor })

  const dimensao = (codigo: string) =>
    tabela.dimensoes.find((d) => d.codigo === codigo)
  const opcoes = (codigo: string) =>
    dimensao(codigo)?.opcoes.filter((o) => o.ativo) ?? []
  const faixas = (tipo: string) =>
    tabela.faixas
      .filter((f) => f.grupo === GRUPO_DO_PROFISSIONAL && f.tipo === tipo)
      .sort((a, b) => a.ordem - b.ordem)
  const rotulo = (codigo: string, alternativo: string) =>
    dimensao(codigo)?.rotulo ?? alternativo

  return (
    <div
      className={
        compacto
          ? 'rounded-xl border border-border bg-card p-4'
          : 'rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-6'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Conte sobre a empresa
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(respostasIniciais(tabela))}
          className="text-muted-foreground"
        >
          <RotateCcw className="size-3.5" />
          Recomeçar
        </Button>
      </div>

      <div className={compacto ? 'mt-4 space-y-4' : 'mt-5 space-y-6'}>
        <Campo label={rotulo('regime', 'Enquadramento fiscal')}>
          <CampoEnquadramento
            opcoes={opcoes('regime')}
            value={respostas.regime}
            onChange={(v) => set('regime', v)}
          />
        </Campo>

        <Campo label={rotulo('atividade', 'Ramo da empresa')}>
          <CampoRamo
            opcoes={opcoes('atividade')}
            value={respostas.atividades}
            onChange={(v) => set('atividades', v)}
          />
        </Campo>

        <Campo label="Funcionários registrados">
          <Stepper
            label="funcionários"
            value={respostas.funcionarios}
            onChange={(v) => set('funcionarios', v)}
            max={200}
            suffix="pessoas"
          />
        </Campo>

        <Campo label="Notas fiscais por mês">
          <CampoNotasFiscais
            faixas={faixas('notas_fiscais')}
            emissores={opcoes('emissor')}
            rotuloEmissor={rotulo('emissor', 'Quem emitirá as notas')}
            faixa={respostas.notasFiscais}
            onFaixaChange={(v) => set('notasFiscais', v)}
            emissor={respostas.emissor}
            onEmissorChange={(v) => set('emissor', v)}
          />
        </Campo>

        <Campo label="Faturamento mensal">
          <CampoFaturamento
            faixas={faixas('faturamento')}
            value={respostas.faturamento}
            onChange={(v) => set('faturamento', v)}
          />
        </Campo>

        <Campo label={rotulo('atendimento', 'Como quer ser atendido')}>
          <div className="space-y-2">
            {opcoes('atendimento').map((o) => (
              <OpcaoCard
                key={o.codigo}
                active={respostas.atendimento === o.codigo}
                onClick={() => set('atendimento', o.codigo)}
                label={o.rotulo}
                desc={o.ajuda ?? ''}
              />
            ))}
          </div>
        </Campo>

        <Campo label={rotulo('rotina', 'Quem cuida da rotina')}>
          <div className="space-y-2">
            {opcoes('rotina').map((o) => (
              <OpcaoCard
                key={o.codigo}
                active={respostas.rotina === o.codigo}
                onClick={() => set('rotina', o.codigo)}
                label={o.rotulo}
                desc={o.ajuda ?? ''}
              />
            ))}
          </div>
        </Campo>
      </div>
    </div>
  )
}
