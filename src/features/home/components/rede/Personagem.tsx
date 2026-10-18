import Image from "next/image";

/** Contrato visual independente do relógio: pode receber um ator Rive futuramente. */
export function Personagem({ asset, trabalhando = false }: { asset: string; trabalhando?: boolean }) {
  return <div data-asset={asset} className={`viva-ator ${trabalhando ? "viva-trabalhando" : ""}`}>
    <Image src={`/images/rede-vincis/${asset}.webp`} width={600} height={500} loading={asset === "cliente" || asset === "central" ? "eager" : "lazy"} alt="" sizes="(max-width: 767px) 220px, 320px" draggable={false} />
    {trabalhando && <span className="viva-digitando" aria-label="Trabalhando"><i /><i /><i /></span>}
  </div>;
}
