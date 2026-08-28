/**
 * Formatação pt-BR compartilhada pela Consultoria Agendada.
 *
 * Estas três funções nasceram dentro do card do perfil. Saíram de lá quando o
 * modal de contratação passou a mostrar o mesmo preço, a mesma data e a mesma
 * duração: duas cópias do mesmo formato é como um "R$ 180,00" no card vira
 * "R$180" no resumo, e o Cliente passa a desconfiar de qual dos dois é o valor
 * de verdade. Puras de propósito — nenhuma depende de React, então os testes
 * não precisam de DOM.
 */

/** Centavos → `R$ 180,00`. Dinheiro nunca trafega como decimal nesta plataforma. */
export function formatarPreco(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/**
 * `2026-08-31` → `31 de agosto de 2026`.
 *
 * A data local da agenda é lida como UTC de propósito: ela já é a data no fuso
 * do Profissional, e reinterpretá-la no fuso de quem está lendo devolveria o
 * dia anterior para metade do planeta.
 */
export function dataPorExtenso(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(ano, mes - 1, dia)))
}

/**
 * `2026-08-31` → `Segunda-feira, 31 de agosto de 2026`.
 *
 * O resumo da contratação mostra o dia da semana porque é assim que alguém
 * confere um compromisso — ninguém decide olhando só o número do dia.
 */
export function dataPorExtensoComDiaDaSemana(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(ano, mes - 1, dia)))
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** `60` → `1 hora`; `45` → `45 minutos`; `90` → `1 hora e 30 minutos`. */
export function duracaoPorExtenso(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  const partes: string[] = []
  if (horas > 0) partes.push(horas === 1 ? '1 hora' : `${horas} horas`)
  if (resto > 0) partes.push(resto === 1 ? '1 minuto' : `${resto} minutos`)
  return partes.length ? partes.join(' e ') : '0 minuto'
}
