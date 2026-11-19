'use client'

import { useState, type KeyboardEvent } from 'react'
import { Plus, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LIMITES_ARTIGO } from '../../../constants/limites'

/**
 * Palavras-chave: digite e tecle Enter (ou vírgula) para adicionar; cada termo
 * vira uma etiqueta com botão de remover. Até 10, sem repetição. Servem à
 * organização editorial e à busca interna da Central — não a um
 * `<meta keywords>`, que o Google ignora.
 */
export function CampoPalavrasChave({
  valor,
  aoAlterar,
  desabilitado,
  erro,
}: {
  valor: string[]
  aoAlterar: (palavras: string[]) => void
  desabilitado: boolean
  erro?: string
}) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const cheio = valor.length >= LIMITES_ARTIGO.palavrasChave

  function adicionar() {
    const palavra = texto.replace(/[,;]+$/g, '').replace(/\s+/g, ' ').trim()
    if (!palavra) return
    if (palavra.length < LIMITES_ARTIGO.palavraChave.min || palavra.length > LIMITES_ARTIGO.palavraChave.max) {
      setAviso(`Cada termo deve ter de ${LIMITES_ARTIGO.palavraChave.min} a ${LIMITES_ARTIGO.palavraChave.max} caracteres.`)
      return
    }
    if (valor.some((existente) => existente.toLocaleLowerCase('pt-BR') === palavra.toLocaleLowerCase('pt-BR'))) {
      setAviso('Este termo já foi adicionado.')
      return
    }
    if (cheio) {
      setAviso(`Limite de ${LIMITES_ARTIGO.palavrasChave} palavras-chave.`)
      return
    }
    aoAlterar([...valor, palavra])
    setTexto('')
    setAviso(null)
  }

  function teclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter' || evento.key === ',') {
      // Enter aqui adiciona o termo — nunca envia o formulário.
      evento.preventDefault()
      adicionar()
    } else if (evento.key === 'Backspace' && !texto && valor.length) {
      aoAlterar(valor.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label htmlFor="artigo-palavra-chave" className="flex items-center gap-1.5">
          <Tag className="size-3.5" aria-hidden /> Palavras-chave
        </Label>
        <span className={cheio ? 'text-xs font-semibold text-amber-700 dark:text-amber-400' : 'text-xs text-muted-foreground'}>
          {valor.length}/{LIMITES_ARTIGO.palavrasChave}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Termos que um leitor usaria para achar o artigo na busca da Central (ex.: DAS, DASN-SIMEI). Enter para adicionar.
      </p>
      {valor.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Palavras-chave adicionadas">
          {valor.map((palavra) => (
            <li key={palavra}>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-sm text-foreground">
                {palavra}
                <button
                  type="button"
                  disabled={desabilitado}
                  aria-label={`Remover palavra-chave ${palavra}`}
                  onClick={() => aoAlterar(valor.filter((existente) => existente !== palavra))}
                  className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          id="artigo-palavra-chave"
          value={texto}
          disabled={desabilitado || cheio}
          maxLength={LIMITES_ARTIGO.palavraChave.max + 2}
          placeholder={cheio ? 'Limite atingido' : 'Digite um termo e tecle Enter'}
          enterKeyHint="done"
          onChange={(evento) => {
            setTexto(evento.target.value)
            setAviso(null)
          }}
          onKeyDown={teclar}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:text-sm"
        />
        <Button type="button" variant="outline" className="h-10 gap-1" disabled={desabilitado || cheio || !texto.trim()} onClick={adicionar}>
          <Plus className="size-4" aria-hidden /> Adicionar
        </Button>
      </div>
      {aviso || erro ? (
        <p role="alert" className="text-xs text-destructive">
          {aviso ?? erro}
        </p>
      ) : null}
    </div>
  )
}
