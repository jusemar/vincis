/**
 * Regras puras da demonstração de busca da Home — sem React, sem DOM.
 */

/**
 * Resultado real do termo exibido no campo. Cada prefixo do termo foi lido no
 * servidor com a busca da vitrine; se faltar algum (não deveria), usa o maior
 * prefixo disponível — nunca uma lista inventada.
 */
export function resultadoDaBusca<T>(buscas: Record<string, T>, termo: string): T | null {
  for (let tamanho = termo.length; tamanho >= 0; tamanho -= 1) {
    const resultado = buscas[termo.slice(0, tamanho)];
    if (resultado) return resultado;
  }
  return null;
}

/** Tamanho, em px, da "janela" virtual onde as telas reais são desenhadas. */
export type DimensoesPalco = { largura: number; altura: number };

/**
 * A janela virtual acompanha o breakpoint REAL do aparelho. Os componentes
 * reais usam media queries (`sm:`, `md:`, `lg:`) da viewport do navegador, e
 * não do contêiner — então no celular eles já estão no layout de celular, e a
 * janela virtual precisa ter largura de celular para o desenho ficar fiel.
 */
export function dimensoesDoPalco(larguraJanela: number): DimensoesPalco {
  // Janelas largas o bastante para a visão geral: busca + vários cards, e o
  // perfil com cabeçalho e coluna lateral juntos. O zoom fica só para o clique
  // e a digitação.
  if (larguraJanela >= 1024) return { largura: 1152, altura: 820 };
  if (larguraJanela >= 640) return { largura: 768, altura: 900 };
  // Abaixo de 640 o layout real é o de celular; 440 ainda é celular para os
  // breakpoints e mostra um pouco mais de página que 390.
  return { largura: 440, altura: 760 };
}

export type Camera = { x: number; y: number; zoom: number };

/**
 * Enquadra um ponto com um zoom sem mostrar área fora da tela: o centro é
 * limitado para que as bordas da janela ampliada nunca passem das bordas da
 * página. Com zoom 1 o resultado é sempre o centro da janela.
 */
export function enquadrarCamera(ponto: { x: number; y: number }, zoom: number, palco: DimensoesPalco): Camera {
  const z = Math.max(1, zoom);
  const meiaLargura = palco.largura / (2 * z);
  const meiaAltura = palco.altura / (2 * z);
  return {
    zoom: z,
    x: Math.min(palco.largura - meiaLargura, Math.max(meiaLargura, ponto.x)),
    y: Math.min(palco.altura - meiaAltura, Math.max(meiaAltura, ponto.y)),
  };
}

/** Câmera neutra: página inteira, sem ampliação. */
export function cameraNeutra(palco: DimensoesPalco): Camera {
  return { x: palco.largura / 2, y: palco.altura / 2, zoom: 1 };
}
