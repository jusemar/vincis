import { AtendimentosBoard } from "./atendimentos/AtendimentosBoard";
import type { Protocol } from "../types/atendimentos";

interface Props {
  /** Atendimentos reais carregados no servidor. Vazio enquanto não houver. */
  atendimentosReais?: Protocol[];
  usuarioId?: string;
}

export default function AtendimentosPage({ atendimentosReais, usuarioId }: Props) {
  return (
    <AtendimentosBoard
      atendimentosReais={atendimentosReais}
      usuarioId={usuarioId}
    />
  );
}
