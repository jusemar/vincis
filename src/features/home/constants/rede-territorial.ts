/** Área externa preservada para manter a composição e o núcleo nas posições atuais. */
export const ENQUADRAMENTO_MAPA = { x: 105, y: 100, largura: 710, altura: 710 * 2 / 3 } as const;
/** As duas artes novas têm proporção praticamente idêntica; ambas ocupam esta mesma área SVG. */
const larguraArte = ENQUADRAMENTO_MAPA.altura * 1292 / 1218;
export const ENQUADRAMENTO_ARTE_MAPA = {
  x: ENQUADRAMENTO_MAPA.x + (ENQUADRAMENTO_MAPA.largura - larguraArte) / 2,
  y: ENQUADRAMENTO_MAPA.y,
  largura: larguraArte,
  altura: ENQUADRAMENTO_MAPA.altura,
} as const;
/** Núcleo no mesmo referencial do mapa, idêntico em desktop e mobile. */
export const ENQUADRAMENTO_NUCLEO = { x: 613, y: 330, largura: 520 } as const;
export const CORES_REDE = { cliente: "#00cba9", profissional: "#e7a51c" } as const;

// Frações da área total da arte clara (1292 × 1218), conferidas também sobre a arte escura.
// O mesmo mapeamento proporcional é usado por marcadores, linhas e pulsos em todas as telas.
export const marcadoresTerritoriais = [
  { id: "am-cliente", tipo: "cliente", x: 0.19350, y: 0.20525 },
  { id: "am-profissional", tipo: "profissional", x: 0.30186, y: 0.26273 },
  { id: "rr-profissional", tipo: "profissional", x: 0.31347, y: 0.07389 },
  { id: "ap-cliente", tipo: "cliente", x: 0.57043, y: 0.10673 },
  { id: "pa-cliente", tipo: "cliente", x: 0.47988, y: 0.22989 },
  { id: "pa-profissional", tipo: "profissional", x: 0.54954, y: 0.27915 },
  { id: "ac-profissional", tipo: "profissional", x: 0.12940, y: 0.3093 },
  { id: "ac-cliente", tipo: "cliente", x: 0.12384, y: 0.37356 },
  { id: "ro-cliente", tipo: "cliente", x: 0.26316, y: 0.40640 },
  { id: "ro-profissional", tipo: "profissional", x: 0.29799, y: 0.43924 },
  { id: "mt-profissional", tipo: "profissional", x: 0.43344, y: 0.48440 },
  { id: "am-cliente-interior", tipo: "cliente", x: 0.34830, y: 0.22989 },
  { id: "pa-cliente-leste", tipo: "cliente", x: 0.61146, y: 0.23399 },
  { id: "ma-profissional", tipo: "profissional", x: 0.68885, y: 0.25452 },
  { id: "pi-cliente", tipo: "cliente", x: 0.79334, y: 0.29146 },
  { id: "ce-profissional", tipo: "profissional", x: 0.86300, y: 0.27915 },
  { id: "rn-cliente", tipo: "cliente", x: 0.94427, y: 0.30788 },
  { id: "pe-profissional", tipo: "profissional", x: 0.89009, y: 0.36946 },
  { id: "ba-cliente", tipo: "cliente", x: 0.83978, y: 0.48440 },
  { id: "ba-profissional", tipo: "profissional", x: 0.85913, y: 0.44335 },
  { id: "rs-cliente-norte", tipo: "cliente", x: 0.46440, y: 0.87849 },
  { id: "pa-profissional-norte", tipo: "profissional", x: 0.51084, y: 0.15599 },
  { id: "es-profissional", tipo: "profissional", x: 0.82430, y: 0.64860 },
  { id: "mg-cliente", tipo: "cliente", x: 0.74000, y: 0.66000 },
  { id: "rj-profissional", tipo: "profissional", x: 0.77012, y: 0.71839 },
  { id: "ba-cliente-interior", tipo: "cliente", x: 0.81656, y: 0.52956 },
  { id: "pr-profissional", tipo: "profissional", x: 0.51084, y: 0.73892 },
  { id: "sc-cliente", tipo: "cliente", x: 0.59985, y: 0.83744 },
  { id: "rs-profissional", tipo: "profissional", x: 0.55341, y: 0.88259 },
  { id: "rs-cliente", tipo: "cliente", x: 0.45000, y: 0.68000 },
  { id: "rr-cliente", tipo: "cliente", x: 0.35217, y: 0.11905 },
  { id: "ma-cliente", tipo: "cliente", x: 0.71594, y: 0.30378 },
  { id: "mt-cliente-oeste", tipo: "cliente", x: 0.36378, y: 0.50903 },
  { id: "sp-cliente", tipo: "cliente", x: 0.63080, y: 0.71018 },
] as const;
