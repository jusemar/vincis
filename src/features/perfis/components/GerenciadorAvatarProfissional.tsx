"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ACCEPT_AVATAR, useAvatarProfissional } from "../hooks/useAvatarProfissional";

type Props = {
  /** `avatar_url` como veio do servidor. */
  urlInicial: string | null;
  /** Nome exibido: gera as iniciais do fallback e o texto alternativo. */
  nome: string;
};

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

/**
 * Foto de perfil do próprio prestador no painel "Meu perfil": adicionar,
 * trocar e remover, no mesmo lugar em que a foto já era exibida.
 *
 * Grava na hora, independente do "Salvar" do formulário ao redor — a foto é
 * um arquivo no storage, não um campo de rascunho. Todos os botões são
 * `type="button"` porque este bloco vive dentro do `<form>` do perfil.
 */
export function GerenciadorAvatarProfissional({ urlInicial, nome }: Props) {
  const [url, setUrl] = useState(urlInicial);
  const inputRef = useRef<HTMLInputElement>(null);
  const { previa, enviando, removendo, ocupado, enviar, remover } =
    useAvatarProfissional({ aoAlterar: setUrl });

  const imagem = previa ?? url;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        <div className="grid size-20 place-items-center overflow-hidden rounded-full bg-gradient-gold text-xl font-bold text-on-gradient ring-4 ring-amber-500/15">
          {imagem ? (
            // `<img>` simples: URL pública externa (Vercel Blob) ou `blob:` da
            // prévia local, nenhuma das duas configurada em next/image.
            <img src={imagem} alt={nome} className="size-full object-cover" />
          ) : (
            iniciais(nome)
          )}
        </div>
        {ocupado && (
          <div
            className="absolute inset-0 grid place-items-center rounded-full bg-background/60"
            aria-live="polite"
          >
            <LoaderCircle className="size-6 animate-spin text-primary" />
            <span className="sr-only">
              {enviando ? "Enviando foto" : "Removendo foto"}
            </span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_AVATAR}
        className="hidden"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          // Limpa já, para escolher o mesmo arquivo de novo após um erro.
          evento.target.value = "";
          if (arquivo) void enviar(arquivo);
        }}
      />

      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          <Camera />
          {url ? "Trocar foto" : "Adicionar foto"}
        </Button>
        {url && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={ocupado}
                aria-label="Remover foto"
                className="text-destructive hover:text-destructive"
              >
                {removendo ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover foto de perfil?</AlertDialogTitle>
                <AlertDialogDescription>
                  Seu perfil público e o card na lista de profissionais passam a
                  mostrar suas iniciais. Você pode enviar outra foto quando
                  quiser.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void remover()}>
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
