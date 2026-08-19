import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/connection";
import { usuarios, sessoesUsuario } from "@/db/schema";
import { LoginSchema } from "@/features/usuarios/schemas/login";
import { compararHash } from "@/features/usuarios/lib/hash-senha";
import { gerarTokenSessao } from "@/features/usuarios/lib/gerar-token-sessao";
import { COOKIE_SESSAO } from "@/features/usuarios/constants/sessao";
import { contaVerificada } from "@/features/usuarios/lib/verificacao-conta";
import { resolverAcessoUsuario } from "@/features/usuarios/queries/obter-destino-apos-login";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = LoginSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    const { emailOuWhatsapp, senha } = validated.data;

    const [usuario] = await db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        whatsapp: usuarios.whatsapp,
        senhaHash: usuarios.senhaHash,
        status: usuarios.status,
        emailVerificado: usuarios.emailVerificado,
        whatsappVerificado: usuarios.whatsappVerificado,
      })
      .from(usuarios)
      .where(
        or(
          eq(usuarios.email, emailOuWhatsapp),
          eq(usuarios.whatsapp, emailOuWhatsapp)
        )
      )
      .limit(1);

    if (!usuario) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // A senha é checada antes do estado da conta. Só quem já provou conhecer a
    // senha recebe um motivo específico — assim a orientação de confirmação não
    // vira um oráculo para descobrir quais e-mails existem na plataforma.
    const senhaValida = await compararHash(senha, usuario.senhaHash);
    if (!senhaValida) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    if (usuario.status === "bloqueado") {
      return NextResponse.json(
        { sucesso: false, mensagem: "Esta conta está bloqueada." },
        { status: 403 }
      );
    }

    // Vale a identidade comprovada, não o canal: quem foi confirmado pela
    // Gestão via WhatsApp entra igual a quem clicou no link do e-mail.
    if (!contaVerificada(usuario)) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Sua conta ainda não foi confirmada. Confirme pelo link enviado ao seu e-mail ou fale com a Vincis pelo WhatsApp cadastrado.",
          dados: { contaNaoConfirmada: true, email: usuario.email },
        },
        { status: 403 }
      );
    }

    if (usuario.status !== "ativo") {
      return NextResponse.json(
        { sucesso: false, mensagem: "Acesso indisponível" },
        { status: 403 }
      );
    }

    const acesso = await resolverAcessoUsuario(usuario.id);
    if (!acesso) return NextResponse.json({ sucesso: false, mensagem: "Acesso indisponível" }, { status: 403 });
    const perfilTipo = acesso.perfil;
    const destino = acesso.destino;

    const { token, hash } = gerarTokenSessao();

    const expiraEm = new Date();
    expiraEm.setHours(expiraEm.getHours() + 24);

    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm,
    });

    const response = NextResponse.json({
      sucesso: true,
      mensagem: "Autenticado com sucesso",
      dados: {
        tokenSessao: token,
        expiraEm: expiraEm.toISOString(),
        destino,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          whatsapp: usuario.whatsapp,
          status: usuario.status,
          perfilTipo,
        },
      },
    });
    response.cookies.set(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiraEm,
    });
    return response;
  } catch (error) {
    console.error("[AUTH_LOGIN]", error);
    return NextResponse.json(
      { sucesso: false, mensagem: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
