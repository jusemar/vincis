'use client'

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'

/**
 * Seis posições para o código recebido por SMS — o mesmo campo no cadastro e
 * na recuperação de senha.
 *
 * - colar os 6 dígitos de uma vez (em qualquer posição) preenche tudo;
 * - teclado numérico no celular e `one-time-code` para o preenchimento
 *   automático do iOS/Android;
 * - Backspace e setas navegam entre as posições;
 * - ao completar, chama `onCompleto` (a tela valida sem precisar de clique).
 */
export const TAMANHO_CODIGO = 6

export function CampoCodigoOtp({
  valor,
  onAlterar,
  onCompleto,
  desabilitado,
  legenda,
}: {
  valor: string
  onAlterar: (valor: string) => void
  onCompleto?: (codigo: string) => void
  desabilitado?: boolean
  legenda: ReactNode
}) {
  const caixas = useRef<(HTMLInputElement | null)[]>([])
  const digitos = Array.from({ length: TAMANHO_CODIGO }, (_, i) => valor[i] ?? '')

  // Ao abrir e quando o código é limpo (erro, novo envio), o foco volta ao início.
  useEffect(() => {
    if (!valor && !desabilitado) caixas.current[0]?.focus()
  }, [valor, desabilitado])

  function preencher(posicao: number, entrada: string) {
    const numeros = entrada.replace(/\D/g, '')
    const novos = [...digitos]
    if (!numeros) {
      novos[posicao] = ''
      onAlterar(novos.join('').slice(0, TAMANHO_CODIGO))
      return
    }
    numeros
      .slice(0, TAMANHO_CODIGO - posicao)
      .split('')
      .forEach((d, i) => (novos[posicao + i] = d))
    const codigo = novos.join('')
    onAlterar(codigo)
    caixas.current[Math.min(posicao + numeros.length, TAMANHO_CODIGO - 1)]?.focus()
    if (codigo.length === TAMANHO_CODIGO && novos.every(Boolean)) onCompleto?.(codigo)
  }

  function colar(e: ClipboardEvent<HTMLDivElement>) {
    const numeros = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, TAMANHO_CODIGO)
    if (!numeros) return
    e.preventDefault()
    preencher(0, numeros)
  }

  function teclar(posicao: number, e: KeyboardEvent<HTMLInputElement>) {
    // As caixas ficam dentro de outros formulários (ex.: Meu Perfil): Enter
    // aqui disparava o envio implícito desse formulário ("Salvar alterações").
    if (e.key === 'Enter') {
      e.preventDefault()
      const codigo = digitos.join('')
      if (codigo.length === TAMANHO_CODIGO) onCompleto?.(codigo)
      return
    }
    if (e.key === 'Backspace' && !digitos[posicao] && posicao > 0) caixas.current[posicao - 1]?.focus()
    if (e.key === 'ArrowLeft' && posicao > 0) caixas.current[posicao - 1]?.focus()
    if (e.key === 'ArrowRight' && posicao < TAMANHO_CODIGO - 1) caixas.current[posicao + 1]?.focus()
  }

  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-2 text-sm text-foreground/80">{legenda}</legend>
      <div className="flex justify-between gap-2" onPaste={colar}>
        {digitos.map((digito, i) => (
          <input
            key={i}
            ref={(el) => {
              caixas.current[i] = el
            }}
            value={digito}
            onChange={(e) => preencher(i, e.target.value)}
            onKeyDown={(e) => teclar(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={i === 0 ? TAMANHO_CODIGO : 1}
            aria-label={`Dígito ${i + 1} de ${TAMANHO_CODIGO}`}
            disabled={desabilitado}
            className="h-14 w-full min-w-0 rounded-xl border border-input bg-background text-center text-2xl font-bold tabular-nums text-foreground transition-shadow focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.2)] focus:outline-none disabled:opacity-50 sm:h-16"
          />
        ))}
      </div>
    </fieldset>
  )
}
