import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db/connection";
import { usuarios, sessoesUsuario } from "@/db/schema";
import { COOKIE_SESSAO } from "@/features/usuarios/constants/sessao";
import { resolverAcessoUsuario } from "@/features/usuarios/queries/obter-destino-apos-login";
import { montarUsuarioAutenticado } from "@/features/usuarios/lib/dados-usuario-autenticado";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Token não informado" },
        { status: 401 }
      );
    }

    const hash = createHash("sha256").update(token).digest("hex");

    const [sessao] = await db
      .select()
      .from(sessoesUsuario)
      .where(eq(sessoesUsuario.tokenHash, hash))
      .limit(1);

    if (
      !sessao ||
      sessao.encerradaEm ||
      new Date() > sessao.expiraEm
    ) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Sessão inválida ou expirada" },
        { status: 401 }
      );
    }

    const [usuario] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        whatsapp: usuarios.whatsapp,
        status: usuarios.status,
      })
      .from(usuarios)
      .where(eq(usuarios.id, sessao.usuarioId))
      .limit(1);

    if (!usuario) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Usuário não encontrado" },
        { status: 401 }
      );
    }

    const acesso = await resolverAcessoUsuario(usuario.id);
    if (!acesso) return NextResponse.json({ sucesso: false, mensagem: "Acesso indisponível" }, { status: 403 });

    const response = NextResponse.json({
      sucesso: true,
      dados: {
        // Mesma montagem do login: uma conta descrita de um jeito só.
        usuario: {
          ...montarUsuarioAutenticado(usuario, acesso),
          destino: acesso.destino,
        },
      },
    });
    response.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: sessao.expiraEm,
    });
    return response;
  } catch (error) {
    console.error("[AUTH_SESSAO]", error);
    return NextResponse.json(
      { sucesso: false, mensagem: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
