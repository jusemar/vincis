/**
 * `<script type="application/ld+json">` renderizado no servidor.
 *
 * O `<` é escapado para que nenhum texto vindo do cadastro (nome, apresentação)
 * consiga fechar a tag e injetar HTML — prática recomendada pela documentação
 * do Next.js para JSON-LD.
 */
export function DadosEstruturados({ dados }: { dados: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, '\\u003c') }}
    />
  )
}
