/**
 * Progresso do checklist: concluídas sobre o total.
 *
 * Fica num arquivo próprio, sem nenhum acesso a banco, porque é usado dos dois
 * lados da fronteira: o servidor monta o DTO e a tela desenha a barra. O
 * percentual é derivado na hora — guardar percentual seria guardar uma conta que
 * envelhece a cada etapa marcada.
 *
 * Sem etapas não há progresso: devolve `null` e o card não desenha barra
 * nenhuma, em vez de mostrar uma barra vazia que pareceria trabalho parado.
 */
export function calcularProgresso(
  itens: { concluido: boolean }[],
): { done: number; total: number; percentual: number } | null {
  if (!itens.length) return null
  const done = itens.filter((item) => item.concluido).length
  return {
    done,
    total: itens.length,
    percentual: Math.round((done / itens.length) * 100),
  }
}
