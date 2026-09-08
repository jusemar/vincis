import { PainelVazio } from '@/features/portal-cliente/components/ui/primitivos'

/**
 * Seção do menu que ainda não tem tela.
 *
 * Aparece no lugar do conteúdo, e não no lugar do item de menu: esconder a
 * seção faria o menu mudar de tamanho conforme o que já existe, e ninguém
 * conseguiria ver o mapa completo do módulo — que é justamente o que está em
 * avaliação nesta fase.
 *
 * Diz o que virá ali, sem prometer data e sem fingir dado: a borda tracejada do
 * `PainelVazio` já é o vocabulário da Área do Cliente para "aqui ainda não há
 * nada", e reusá-lo evita inventar um segundo jeito de dizer a mesma coisa.
 */
export function SecaoEmPreparo({
  titulo,
  descricao,
}: {
  titulo: string
  descricao: string
}) {
  return (
    <PainelVazio
      titulo={titulo}
      descricao={`${descricao} Esta seção entra quando o Programa de Parceiros tiver dados reais.`}
    />
  )
}
