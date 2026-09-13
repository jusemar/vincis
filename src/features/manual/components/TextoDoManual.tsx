import { Fragment } from 'react'

/**
 * Texto do manual com o único destaque que o conteúdo usa: `**assim**`.
 *
 * Nada de HTML vindo do conteúdo — o texto é quebrado em pedaços e cada pedaço
 * é renderizado como texto comum ou `<strong>`.
 */
export function TextoDoManual({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {partes.map((parte, indice) =>
        parte.startsWith('**') && parte.endsWith('**') ? (
          <strong key={indice} className="font-semibold text-foreground">
            {parte.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={indice}>{parte}</Fragment>
        ),
      )}
    </>
  )
}
