import { montarLlmsTxt } from '@/features/institucional/lib/llms'

/**
 * `/llms.txt` — informações públicas sobre a Vincis em Markdown simples.
 *
 * Gerado no build (conteúdo estático, sem banco nem sessão) e servido como
 * texto UTF-8. O conteúdo vive em `features/institucional/lib/llms.ts`; um
 * futuro `/llms-full.txt` seria uma rota irmã reaproveitando a mesma lista.
 */
export const dynamic = 'force-static'

export function GET() {
  return new Response(montarLlmsTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
