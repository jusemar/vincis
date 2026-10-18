/** Coordenadas da arte de 1536 × 1024, mantidas no mesmo referencial do asset. */
// Diminuir x move todo o conjunto para a esquerda, sem alterar escala ou posições internas.
export const ENQUADRAMENTO_MAPA = { x: 105, y: 100, largura: 710, altura: 710 * 2 / 3 } as const;
/** Núcleo no mesmo referencial do mapa, idêntico em desktop e mobile. */
export const ENQUADRAMENTO_NUCLEO = { x: 613, y: 330, largura: 520 } as const;
export const CORES_REDE = { cliente: "#00cba9", profissional: "#e7a51c" } as const;

export const marcadoresTerritoriais = [
  { id: "am-cliente", tipo: "cliente", x: 395, y: 248 },
  { id: "am-profissional", tipo: "profissional", x: 565, y: 245 },
  { id: "rr-profissional", tipo: "profissional", x: 620, y: 80 },
  { id: "ap-cliente", tipo: "cliente", x: 835, y: 155 },
  { id: "pa-cliente", tipo: "cliente", x: 740, y: 285 },
  { id: "pa-profissional", tipo: "profissional", x: 860, y: 270 },
  { id: "ac-profissional", tipo: "profissional", x: 240, y: 325 },
  { id: "ac-cliente", tipo: "cliente", x: 347, y: 345 },
  { id: "ro-cliente", tipo: "cliente", x: 490, y: 367 },
  { id: "ro-profissional", tipo: "profissional", x: 560, y: 390 },
  { id: "mt-profissional", tipo: "profissional", x: 650, y: 350 },
  { id: "am-cliente-interior", tipo: "cliente", x: 630, y: 170 },
  { id: "pa-cliente-leste", tipo: "cliente", x: 940, y: 300 },
  { id: "ma-profissional", tipo: "profissional", x: 1020, y: 210 },
  { id: "pi-cliente", tipo: "cliente", x: 1140, y: 355 },
  { id: "ce-profissional", tipo: "profissional", x: 1240, y: 285 },
  { id: "rn-cliente", tipo: "cliente", x: 1350, y: 310 },
  { id: "pe-profissional", tipo: "profissional", x: 1315, y: 380 },
  { id: "ba-cliente", tipo: "cliente", x: 1220, y: 480 },
  { id: "ba-profissional", tipo: "profissional", x: 1220, y: 410 },
  { id: "rs-cliente-norte", tipo: "cliente", x: 700, y: 830 },
  { id: "pa-profissional-norte", tipo: "profissional", x: 790, y: 200 },
  { id: "es-profissional", tipo: "profissional", x: 1180, y: 580 },
  { id: "mg-cliente", tipo: "cliente", x: 1100, y: 610 },
  { id: "rj-profissional", tipo: "profissional", x: 1140, y: 690 },
  { id: "ba-cliente-interior", tipo: "cliente", x: 1140, y: 480 },
  { id: "pr-profissional", tipo: "profissional", x: 790, y: 750 },
  { id: "sc-cliente", tipo: "cliente", x: 860, y: 830 },
  { id: "rs-profissional", tipo: "profissional", x: 750, y: 830 },
  { id: "rs-cliente", tipo: "cliente", x: 780, y: 900 },
  // Pontos redistribuídos em áreas livres; a base mantém uma zona sem marcadores.
  { id: "rr-cliente", tipo: "cliente", x: 530, y: 118 },
  { id: "ma-cliente", tipo: "cliente", x: 1080, y: 275 },
  { id: "mt-cliente-oeste", tipo: "cliente", x: 610, y: 440 },
  { id: "sp-cliente", tipo: "cliente", x: 950, y: 710 },
] as const;
