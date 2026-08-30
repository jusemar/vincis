'use client'

import { useState } from 'react'
import { Tags } from 'lucide-react'
import type { TabelaPrecificacao } from '../../types/precificacao'
import { SecaoAdicionais } from './SecaoAdicionais'
import { SecaoDescontos } from './SecaoDescontos'
import { SecaoFaixas, nomeDoGrupo } from './SecaoFaixas'
import { SecaoFatores } from './SecaoFatores'
import { SecaoPrecosBase } from './SecaoPrecosBase'
import { SecaoVisaoGeral } from './SecaoVisaoGeral'

/**
 * A mesa de trabalho da Precificação.
 *
 * ## Seis seções, e não onze
 *
 * As grades do banco são sete; as decisões comerciais são menos. "Porte da
 * empresa" reúne funcionários, notas e faturamento porque é uma pergunta só —
 * quanto a empresa cresce o trabalho. "Perfil do atendimento" reúne ramo,
 * atendimento e rotina porque as três são acréscimos percentuais sobre a
 * mesma rotina. Uma aba por tabela seria a modelagem vazando para a tela.
 *
 * ## Cada bloco salva o próprio conjunto
 *
 * Não existe um "Salvar tudo": um erro de digitação numa porcentagem não pode
 * derrubar o reajuste de preço que já estava certo ao lado. É também o que
 * permite a conferência de conflito ser específica — só a seção que outra
 * sessão mexeu é recusada.
 */
const SECOES = [
  { id: 'visao', rotulo: 'Visão geral' },
  { id: 'base', rotulo: 'Preços-base' },
  { id: 'porte', rotulo: 'Porte da empresa' },
  { id: 'perfil', rotulo: 'Perfil do atendimento' },
  { id: 'adicionais', rotulo: 'Adicionais' },
  { id: 'descontos', rotulo: 'Descontos e pacote' },
] as const

type SecaoId = (typeof SECOES)[number]['id']

export function PrecificacaoGestaoPage({
  gestorNome,
  tabela,
}: {
  gestorNome: string
  tabela: TabelaPrecificacao
}) {
  const [secao, setSecao] = useState<SecaoId>('visao')

  return (
    <>
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Tags className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Precificação</h1>
          <p className="truncate text-sm text-muted-foreground">
            Valores da página pública de preços · {gestorNome}
          </p>
        </div>
      </div>

      {/* Rolagem horizontal no celular: seis abas não cabem numa linha, e
          quebrar em duas empurraria o conteúdo para baixo da dobra. */}
      <div className="mx-auto mb-5 max-w-5xl overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Seções da precificação"
          className="flex w-max gap-1 rounded-xl bg-muted p-1"
        >
          {SECOES.map((item) => {
            const ativa = item.id === secao
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={ativa}
                onClick={() => setSecao(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  ativa
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.rotulo}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-5xl">
        {secao === 'visao' ? <SecaoVisaoGeral tabela={tabela} /> : null}

        {secao === 'base' ? <SecaoPrecosBase tabela={tabela} /> : null}

        {secao === 'porte' ? (
          <div className="space-y-4">
            <SecaoFaixas
              tabela={tabela}
              tipo="funcionarios"
              titulo="Funcionários registrados"
              descricao="Os primeiros funcionários estão inclusos no preço da rotina. A partir daí, cada um acrescenta um valor fixo por mês."
              rotulo={(faixa) => ({
                rotulo: `${nomeDoGrupo(faixa.grupo)} — por funcionário`,
                ajuda: `Inclusos no preço: ${faixa.limiteMin - 1} funcionários. A cobrança começa no ${faixa.limiteMin}º.`,
              })}
            />
            <SecaoFaixas
              tabela={tabela}
              tipo="notas_fiscais"
              titulo="Notas fiscais por mês"
              descricao="Acréscimo pelo volume de notas emitidas."
              rodape="Esta regra só é cobrada quando as notas são emitidas pela Vincis. Se a própria empresa emite, nenhuma faixa é aplicada."
              rotulo={(faixa) => ({ rotulo: faixa.rotulo })}
            />
            <SecaoFaixas
              tabela={tabela}
              tipo="faturamento"
              titulo="Faturamento mensal"
              descricao="Acréscimo pelo porte financeiro da empresa."
              rotulo={(faixa) => ({ rotulo: faixa.rotulo })}
            />
          </div>
        ) : null}

        {secao === 'perfil' ? (
          <div className="space-y-4">
            <SecaoFatores
              tabela={tabela}
              dimensao="atividade"
              titulo="Ramo da empresa"
              descricao="Quanto cada ramo acrescenta sobre o preço da rotina contábil."
              rodape="O ramo não altera o preço da Assistência Jurídica."
            />
            <SecaoFatores
              tabela={tabela}
              dimensao="atendimento"
              titulo="Como quer ser atendido"
              descricao="Quanto cada forma de atendimento acrescenta sobre o preço."
              rodape="O atendimento é a única dimensão que também acrescenta na Assistência Jurídica."
            />
            <SecaoFatores
              tabela={tabela}
              dimensao="rotina"
              titulo="Quem cuida da rotina"
              descricao="Quanto acrescenta a empresa deixar a rotina inteira com a Vincis."
              rodape="A rotina não altera o preço da Assistência Jurídica."
            />
          </div>
        ) : null}

        {secao === 'adicionais' ? <SecaoAdicionais tabela={tabela} /> : null}

        {secao === 'descontos' ? <SecaoDescontos tabela={tabela} /> : null}
      </div>
    </>
  )
}
