/**
 * Formatação compartilhada entre as duas visões da oportunidade.
 *
 * Cliente e prestador leem os mesmos números; formatá-los em dois lugares faria
 * "R$ 1.500,00" de um lado e "1500" do outro na primeira alteração.
 */

/** Nulo não é zero: sem valor informado, a tela diz isso em vez de inventar. */
export function formatarValor(
  centavos: number | null,
  ausente = 'Não informado',
) {
  if (centavos == null) return ausente
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "20/08/2026 às 18:00" — o formato que as validades usam nas duas telas. */
export function formatarDataHora(iso: string | null) {
  if (!iso) return '—'
  const data = new Date(iso)
  return `${new Intl.DateTimeFormat('pt-BR').format(data)} às ${new Intl.DateTimeFormat(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' },
  ).format(data)}`
}
