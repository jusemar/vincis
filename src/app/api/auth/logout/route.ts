import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db/connection";
import { sessoesUsuario } from "@/db/schema";
import { COOKIE_EMPRESA_ATIVA } from "@/features/empresas/lib/contexto-empresa-cookie";
import { COOKIE_SESSAO } from "@/features/usuarios/constants/sessao";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { tokenSessao?: string };
    const token = body.tokenSessao ?? request.cookies.get(COOKIE_SESSAO)?.value;

    if (!token) {
      const response = NextResponse.json({
        sucesso: true,
        mensagem: "Sessão já encerrada",
      });
      response.cookies.delete(COOKIE_EMPRESA_ATIVA);
      response.cookies.delete(COOKIE_SESSAO);
      return response;
    }

    const hash = createHash("sha256").update(token).digest("hex");

    await db
      .update(sessoesUsuario)
      .set({ encerradaEm: new Date() })
      .where(eq(sessoesUsuario.tokenHash, hash));

    const response = NextResponse.json({
      sucesso: true,
      mensagem: "Sessão encerrada",
    });
    response.cookies.delete(COOKIE_EMPRESA_ATIVA);
    response.cookies.delete(COOKIE_SESSAO);
    return response;
  } catch (error) {
    console.error("[AUTH_LOGOUT]", error);
    return NextResponse.json(
      { sucesso: false, mensagem: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
