import type { MetadataRoute } from 'next'
import { montarRobots } from '@/features/seo'

/** `/robots.txt` — convenção nativa do Next.js; regras em `features/seo`. */
export default function robots(): MetadataRoute.Robots {
  return montarRobots()
}
