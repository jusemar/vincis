import Image from "next/image";
import { useId } from "react";

/** A base oficial e o robô ocupam camadas independentes, prontas para trocar o ator por Rive. */
export function CentralVincis({ processando }: { processando: boolean }) {
  // A cena existe no desktop e no mobile ao mesmo tempo; IDs SVG não podem colidir.
  const metal = useId().replace(/:/g, "");
  return (
    <div className={`viva-hub viva-hub-holografico ${processando ? "viva-processando" : ""}`}>
      <div className="viva-cenario-central" role="img" aria-label="Robô Vincis operando uma base holográfica">
        <Image
          className="viva-base-oficial"
          src="/images/rede-vincis/base sem robo.webp"
          alt=""
          fill
          sizes="(max-width: 767px) 320px, 420px"
          priority
        />
        <div className="viva-robo-independente">
          <Image
            src="/images/rede-vincis/robo-holografico.webp"
            alt=""
            fill
            sizes="(max-width: 767px) 42px, 65px"
            priority
          />
        </div>
        {/* O sprite atual não tem o braço esquerdo; esta camada continua vinculada ao robô. */}
        <svg className="viva-braco-camada" viewBox="0 0 1536 1024" aria-hidden="true">
          <defs>
            <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#fffef9" />
              <stop offset=".5" stopColor="#f2f2e9" />
              <stop offset="1" stopColor="#a6bbb1" />
            </linearGradient>
          </defs>
          <g transform="translate(377 181) scale(1.3)">
            <g className="viva-braco-holografico">
              <circle cx="256" cy="222" r="12" fill="#1d7057" stroke="#d9e9db" strokeWidth="3" />
              <path d="m251 222-28 3-14-30" fill="none" stroke="#496b5c" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m249 219-26 3-14-27" fill="none" stroke={`url(#${metal})`} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="222" cy="223" r="8" fill="#277b61" stroke="#e8eee1" strokeWidth="2" />
              <path d="M209 197c-7 4-13 0-15-6l-5-13c-2-5 3-7 6-3l3 5-7-17c-2-5 4-7 6-2l9 19c9-3 15 9 3 17Z" fill={`url(#${metal})`} stroke="#a5bcb0" strokeWidth="1.5" />
              <circle cx="194" cy="162" r="3" fill="#bfffea" className="viva-ponta-toque" />
            </g>
          </g>
        </svg>
      </div>
      <span className="viva-hub-legenda">
        {processando ? "Organizando sua solicitação…" : "Tecnologia que aproxima pessoas"}
      </span>
    </div>
  );
}
