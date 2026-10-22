"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  removerAvatarProfissional,
  removerFotoDestaqueProfissional,
  salvarAvatarProfissional,
  salvarFotoDestaqueProfissional,
} from "../actions/salvar-avatar-profissional";

/**
 * Operações das imagens públicas do próprio prestador, no navegador: o avatar
 * (foto dos cards) e a foto de destaque (imagem grande do perfil). O fluxo é
 * o mesmo; muda só a action chamada e o tamanho final.
 *
 * A foto é reduzida aqui antes de subir: Server Actions aceitam até 1 MB de
 * corpo (padrão do Next) e uma foto de celular passa disso com folga — era o
 * motivo de o upload falhar sem aviso. Para o avatar, 640 px cobrem com sobra
 * o maior uso (80 px em telas 3x) e o arquivo final fica na casa de dezenas de
 * KB; o destaque fica em 1280 px, ainda bem abaixo do teto. O servidor continua validando tipo, tamanho e assinatura do mesmo jeito:
 * a redução é conveniência, não a barreira de segurança.
 */

/**
 * Lado máximo por finalidade. A foto de destaque ocupa a largura do card da
 * direita (~400 px) e merece mais resolução que o avatar.
 */
const IMAGENS = {
  avatar: {
    ladoMaximo: 640,
    campo: "avatar",
    salvar: salvarAvatarProfissional,
    remover: removerAvatarProfissional,
  },
  destaque: {
    ladoMaximo: 1280,
    campo: "foto",
    salvar: salvarFotoDestaqueProfissional,
    remover: removerFotoDestaqueProfissional,
  },
} as const;

export type FinalidadeImagem = keyof typeof IMAGENS;
/** Teto do arquivo original, só para não decodificar algo absurdo no navegador. */
const TAMANHO_MAXIMO_ORIGINAL = 20 * 1024 * 1024;
/** Margem abaixo do limite de 1 MB da Server Action (o FormData tem overhead). */
const TAMANHO_MAXIMO_ENVIO = 900 * 1024;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPT_AVATAR = TIPOS_ACEITOS.join(",");

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, tipo, 0.85),
  );
}

async function reduzirImagem(arquivo: File, ladoMaximo: number): Promise<File> {
  const bitmap = await createImageBitmap(arquivo, {
    imageOrientation: "from-image",
  });
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("canvas indisponível");

  // WEBP quando o navegador codifica; senão JPEG. Fundo branco antes de
  // desenhar porque JPEG não tem transparência (PNG recortado ficaria preto).
  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, canvas.width, canvas.height);
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvasParaBlob(canvas, "image/webp");
  if (blob?.type !== "image/webp") blob = await canvasParaBlob(canvas, "image/jpeg");
  if (!blob) throw new Error("falha ao gerar imagem");

  // O servidor confere extensão contra tipo, então o nome acompanha o formato.
  const extensao = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `imagem.${extensao}`, { type: blob.type });
}

type Opcoes = {
  /** Qual imagem do perfil este hook opera. */
  finalidade: FinalidadeImagem;
  /** Chamado com a URL nova (ou `null` na remoção) depois que o servidor confirmou. */
  aoAlterar?: (url: string | null) => void;
};

export function useImagemPerfilProfissional({ finalidade, aoAlterar }: Opcoes) {
  const imagem = IMAGENS[finalidade];
  /** Prévia local da imagem escolhida, exibida enquanto o envio acontece. */
  const [previa, setPrevia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  // Libera a URL temporária da prévia quando ela é trocada ou o componente sai.
  useEffect(() => {
    if (!previa) return;
    return () => URL.revokeObjectURL(previa);
  }, [previa]);

  async function enviar(arquivo: File) {
    if (enviando || removendo) return;
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      toast.error("Envie uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_ORIGINAL) {
      toast.error("A imagem é grande demais. Escolha uma de até 20 MB.");
      return;
    }

    setEnviando(true);
    try {
      let reduzida: File;
      try {
        reduzida = await reduzirImagem(arquivo, imagem.ladoMaximo);
      } catch {
        toast.error("Não foi possível ler esta imagem. Tente outra foto.");
        return;
      }
      if (reduzida.size > TAMANHO_MAXIMO_ENVIO) {
        toast.error("A imagem continua grande demais. Tente outra foto.");
        return;
      }
      setPrevia(URL.createObjectURL(reduzida));

      const dados = new FormData();
      dados.set(imagem.campo, reduzida);
      const resultado = await imagem.salvar(dados);
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      aoAlterar?.(resultado.url);
    } catch {
      // Rede caída ou erro inesperado do servidor: a action rejeita em vez de
      // devolver `{ sucesso: false }`, e sem isto a pessoa não via nada.
      toast.error("Não foi possível enviar a foto. Tente novamente.");
    } finally {
      setPrevia(null);
      setEnviando(false);
    }
  }

  async function remover() {
    if (enviando || removendo) return;
    setRemovendo(true);
    try {
      const resultado = await imagem.remover();
      if (!resultado.sucesso) {
        toast.error(resultado.mensagem);
        return;
      }
      toast.success(resultado.mensagem);
      aoAlterar?.(null);
    } catch {
      toast.error("Não foi possível remover a foto. Tente novamente.");
    } finally {
      setRemovendo(false);
    }
  }

  return { previa, enviando, removendo, ocupado: enviando || removendo, enviar, remover };
}

/** Atalho do avatar, usado em Admin > Meu perfil. */
export function useAvatarProfissional(opcoes: Omit<Opcoes, "finalidade"> = {}) {
  return useImagemPerfilProfissional({ ...opcoes, finalidade: "avatar" });
}
