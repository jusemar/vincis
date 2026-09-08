import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/connection";
import {
  usuarios,
  perfis,
  usuariosPerfis,
  tokensUsuario,
} from "@/db/schema";
import { CadastroUsuarioSchema } from "@/features/usuarios/schemas/cadastro";
import { gerarHash } from "@/features/usuarios/lib/hash-senha";
import { gerarToken } from "@/features/usuarios/lib/gerar-token";
import { enviarEmailConfirmacao } from "@/integracoes/email/enviar-confirmacao-email";
import { COOKIE_INDICACAO } from "@/features/parceiros/constants/indicacao";
import { associarIndicacaoAoCadastro } from "@/features/parceiros/lib/associar-cadastro";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = CadastroUsuarioSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { sucesso: false, mensagem: "Dados inválidos" },
        { status: 400 }
      );
    }

    const { nome, email, whatsapp, senha, perfilTipo } = validated.data;

    const usuarioExistente = await db
      .select({ email: usuarios.email, whatsapp: usuarios.whatsapp })
      .from(usuarios)
      .where(
        or(eq(usuarios.email, email), eq(usuarios.whatsapp, whatsapp))
      )
      .limit(1);

    /*
      A regra de duplicidade não muda: e-mail **ou** WhatsApp já usado barra o
      cadastro, como sempre barrou. O que muda é a resposta dizer qual dos dois
      colidiu — "E-mail ou WhatsApp já cadastrado" obrigava quem tentava se
      cadastrar a adivinhar qual campo trocar, e mandava o Gestor procurar uma
      conta sem saber por qual identificador procurá-la.
    */
    const conflito = usuarioExistente[0];

    if (conflito) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            conflito.email === email
              ? "E-mail já cadastrado"
              : "WhatsApp já cadastrado",
        },
        { status: 409 }
      );
    }

    const [perfilEncontrado] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, perfilTipo))
      .limit(1);

    if (!perfilEncontrado) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: `Perfil "${perfilTipo}" não encontrado`,
        },
        { status: 400 }
      );
    }

    const senhaHash = await gerarHash(senha);

    const [usuarioInserido] = await db
      .insert(usuarios)
      .values({
        nome,
        email,
        whatsapp,
        senhaHash,
        status: "pendente_email",
        emailVerificado: false,
        empresaId: null,
      })
      .returning({ id: usuarios.id });

    await db.insert(usuariosPerfis).values({
      usuarioId: usuarioInserido.id,
      perfilId: perfilEncontrado.id,
    });

    /*
      Se este navegador tinha chegado pelo link de um parceiro, a indicação
      passa a apontar para a conta que acabou de nascer dela.

      A função não lança e não altera nada do cadastro: o resultado é ignorado
      de propósito, porque nenhuma resposta desta rota depende dele. Criar conta
      continua sendo criar conta, com ou sem programa de indicação.
    */
    await associarIndicacaoAoCadastro({
      usuarioId: usuarioInserido.id,
      visitanteToken: request.cookies.get(COOKIE_INDICACAO)?.value,
    });

    const { token, hash } = gerarToken();

    const expiraEm = new Date();
    expiraEm.setHours(expiraEm.getHours() + 24);

    const [tokenInserido] = await db
      .insert(tokensUsuario)
      .values({
        usuarioId: usuarioInserido.id,
        tipo: "confirmacao_email",
        tokenHash: hash,
        expiraEm,
      })
      .returning({ id: tokensUsuario.id });

    const envio = await enviarEmailConfirmacao({
      destinatario: email,
      nome,
      token,
    });

    if (!envio.sucesso) {
      await db
        .update(tokensUsuario)
        .set({ usadoEm: new Date() })
        .where(eq(tokensUsuario.id, tokenInserido.id));

      return NextResponse.json(
        {
          sucesso: false,
          mensagem:
            "Sua conta foi criada, mas não foi possível enviar a confirmação. Tente reenviar o e-mail.",
          dados: { contaCriada: true },
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        mensagem:
          "Enviamos um link de confirmação para o endereço informado.",
        dados: {
          usuarioId: usuarioInserido.id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[AUTH_CADASTRO]", error);
    return NextResponse.json(
      { sucesso: false, mensagem: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
