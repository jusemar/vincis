"use client";

import { useRef } from "react";
import { ImagePlus, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
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
import { ACCEPT_AVATAR, type useImagemPerfilProfissional } from "../hooks/useAvatarProfissional";

type Props = {
  /** Há foto de destaque (salva ou em prévia) sendo exibida no card. */
  temFoto: boolean;
  /** Estado e operações do hook, que mora no perfil para alimentar também a prévia. */
  imagem: ReturnType<typeof useImagemPerfilProfissional>;
};

/**
 * Controles da foto grande do perfil, só para o dono em modo de edição.
 *
 * Com foto: ficam sobre a própria imagem (trocar/remover). Sem foto: um botão
 * discreto "Adicionar imagem" no topo do card — que é o único sinal de foto
 * ausente, e só o dono editando o vê. O visitante comum nunca recebe este
 * componente, então nunca vê placeholder.
 *
 * Grava na hora, independente do "Salvar" do perfil: a foto é um arquivo no
 * storage, não um campo de rascunho (mesma regra do avatar).
 */
export function ControlesFotoDestaque({ temFoto, imagem }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { enviando, removendo, ocupado, enviar, remover } = imagem;

  const seletor = (
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
  );

  if (!temFoto) {
    return (
      // `pr-14`: deixa livre o canto do selo de lápis que o perfil põe sobre o
      // card em modo de edição.
      <div className="p-4 pr-14 pb-0">
        {seletor}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
          className="w-full border-dashed text-muted-foreground"
        >
          {enviando ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
          {enviando ? "Enviando imagem..." : "Adicionar imagem"}
        </Button>
      </div>
    );
  }

  return (
    <>
      {seletor}
      {ocupado && (
        <div
          className="absolute inset-0 grid place-items-center bg-background/60"
          aria-live="polite"
        >
          <LoaderCircle className="size-6 animate-spin text-primary" />
          <span className="sr-only">{enviando ? "Enviando imagem" : "Removendo imagem"}</span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
          className="shadow-sm"
        >
          <RefreshCw />
          Trocar imagem
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              disabled={ocupado}
              aria-label="Remover imagem"
              className="text-destructive shadow-sm hover:text-destructive"
            >
              {removendo ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover imagem do perfil?</AlertDialogTitle>
              <AlertDialogDescription>
                A imagem grande deixa de aparecer no seu perfil público. Sua foto
                nos cards da lista de profissionais continua a mesma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remover()}>Remover</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
