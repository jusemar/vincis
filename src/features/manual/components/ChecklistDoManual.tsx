'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TextoDoManual } from './TextoDoManual'

/**
 * Lista de verificação do manual.
 *
 * As marcações ficam só no navegador de quem está testando: servem para a
 * pessoa não se perder numa rodada de testes, e não são registro oficial de
 * nada. Se o navegador não permitir guardar, a lista continua funcionando
 * durante a visita.
 */
const PREFIXO = 'vincis:manual:checklist:'

function lerMarcacoes(id: string): number[] {
  try {
    const bruto = window.localStorage.getItem(PREFIXO + id)
    const lido: unknown = bruto ? JSON.parse(bruto) : []
    return Array.isArray(lido) ? lido.filter((n): n is number => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

function gravarMarcacoes(id: string, marcados: number[]) {
  try {
    window.localStorage.setItem(PREFIXO + id, JSON.stringify(marcados))
  } catch {
    // Sem armazenamento disponível: as marcações valem só nesta visita.
  }
}

export function ChecklistDoManual({
  id,
  itens,
}: {
  id: string
  itens: string[]
}) {
  const [marcados, setMarcados] = useState<number[]>([])

  // Lido depois da montagem: o servidor não conhece o navegador da pessoa.
  useEffect(() => {
    setMarcados(lerMarcacoes(id))
  }, [id])

  function alternar(indice: number, marcado: boolean) {
    setMarcados((atuais) => {
      const proximos = marcado
        ? [...new Set([...atuais, indice])]
        : atuais.filter((n) => n !== indice)
      gravarMarcacoes(id, proximos)
      return proximos
    })
  }

  function limpar() {
    setMarcados([])
    gravarMarcacoes(id, [])
  }

  const feitos = marcados.filter((n) => n < itens.length).length

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-sm font-medium" aria-live="polite">
          {feitos} de {itens.length} marcados
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={limpar} disabled={!feitos}>
          Limpar marcações
        </Button>
      </div>
      <ul className="divide-y divide-border">
        {itens.map((item, indice) => {
          const campo = `${id}-${indice}`
          const marcado = marcados.includes(indice)
          return (
            <li key={campo} className="flex items-start gap-3 px-4 py-3">
              <Checkbox
                id={campo}
                checked={marcado}
                onCheckedChange={(valor) => alternar(indice, valor === true)}
                className="mt-0.5"
              />
              <label
                htmlFor={campo}
                className={`cursor-pointer text-sm leading-relaxed ${marcado ? 'text-muted-foreground line-through' : 'text-foreground/90'}`}
              >
                <TextoDoManual texto={item} />
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
