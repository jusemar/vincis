"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respostasIniciais } from "@/features/precificacao/lib/respostas";
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from "@/features/precificacao/types/precificacao";
import { CampoAdicionais } from "./configurador/CampoAdicionais";
import { CampoEnquadramento } from "./configurador/CampoEnquadramento";
import { CampoFaturamento } from "./configurador/CampoFaturamento";
import { CampoNotasFiscais } from "./configurador/CampoNotasFiscais";
import { CampoRamo } from "./configurador/CampoRamo";
import { OpcaoCard } from "./configurador/OpcaoCard";
import { Stepper } from "./configurador/Stepper";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * As perguntas sobre a empresa.
 *
 * Opções, rótulos e faixas vêm da tabela — o formulário desenha o que a
 * configuração oferece, e não uma cópia dela escrita aqui. Os rótulos dos
 * campos numéricos (funcionários, notas, faturamento) continuam no código
 * porque são texto de tela, e não parte de nenhuma conta.
 */
export function Configurador({
  tabela,
  respostas,
  onChange,
}: {
  tabela: TabelaPrecificacao;
  respostas: RespostasPrecificacao;
  onChange: (r: RespostasPrecificacao) => void;
}) {
  const set = <K extends keyof RespostasPrecificacao>(
    chave: K,
    valor: RespostasPrecificacao[K],
  ) => onChange({ ...respostas, [chave]: valor });

  const dimensao = (codigo: string) =>
    tabela.dimensoes.find((d) => d.codigo === codigo);
  const opcoes = (codigo: string) =>
    dimensao(codigo)?.opcoes.filter((o) => o.ativo) ?? [];
  const faixas = (tipo: string) =>
    tabela.faixas
      .filter((f) => f.grupo === "contabil" && f.tipo === tipo)
      .sort((a, b) => a.ordem - b.ordem);
  const rotulo = (codigo: string, alternativo: string) =>
    dimensao(codigo)?.rotulo ?? alternativo;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-6">
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

      <div className="mt-5 space-y-6">
        <Campo label={rotulo("regime", "Enquadramento fiscal")}>
          <CampoEnquadramento
            opcoes={opcoes("regime")}
            value={respostas.regime}
            onChange={(v) => set("regime", v)}
          />
        </Campo>

        <Campo label={rotulo("atividade", "Ramo da empresa")}>
          <CampoRamo
            opcoes={opcoes("atividade")}
            value={respostas.atividades}
            onChange={(v) => set("atividades", v)}
          />
        </Campo>

        <Campo label="Funcionários registrados">
          <Stepper
            label="funcionários"
            value={respostas.funcionarios}
            onChange={(v) => set("funcionarios", v)}
            max={200}
            suffix="pessoas"
          />
        </Campo>

        <Campo label="Notas fiscais por mês">
          <CampoNotasFiscais
            faixas={faixas("notas_fiscais")}
            emissores={opcoes("emissor")}
            rotuloEmissor={rotulo("emissor", "Quem emitirá as notas")}
            faixa={respostas.notasFiscais}
            onFaixaChange={(v) => set("notasFiscais", v)}
            emissor={respostas.emissor}
            onEmissorChange={(v) => set("emissor", v)}
          />
        </Campo>

        <Campo label="Faturamento mensal">
          <CampoFaturamento
            faixas={faixas("faturamento")}
            value={respostas.faturamento}
            onChange={(v) => set("faturamento", v)}
          />
        </Campo>

        <Campo label={rotulo("atendimento", "Como quer ser atendido")}>
          <div className="space-y-2">
            {opcoes("atendimento").map((o) => (
              <OpcaoCard
                key={o.codigo}
                active={respostas.atendimento === o.codigo}
                onClick={() => set("atendimento", o.codigo)}
                label={o.rotulo}
                desc={o.ajuda ?? ""}
              />
            ))}
          </div>
        </Campo>

        <Campo label={rotulo("rotina", "Quem cuida da rotina")}>
          <div className="space-y-2">
            {opcoes("rotina").map((o) => (
              <OpcaoCard
                key={o.codigo}
                active={respostas.rotina === o.codigo}
                onClick={() => set("rotina", o.codigo)}
                label={o.rotulo}
                desc={o.ajuda ?? ""}
              />
            ))}
          </div>
        </Campo>

        <Campo label="Personalize com adicionais">
          <CampoAdicionais
            adicionais={tabela.adicionais.filter((a) => a.ativo)}
            value={respostas.adicionais}
            onChange={(v) => set("adicionais", v)}
          />
        </Campo>
      </div>
    </div>
  );
}
