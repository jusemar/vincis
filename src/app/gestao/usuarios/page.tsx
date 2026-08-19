import { redirect } from "next/navigation";
import { GestaoUsuariosPage } from "@/features/usuarios/components/gestao/GestaoUsuariosPage";
import { validarGestorVincis } from "@/features/usuarios/lib/validar-gestor-vincis";
import { listarUsuariosGestaoQuery } from "@/features/usuarios/queries/listar-usuarios-gestao";

export default async function GestaoUsuariosRoute() {
  const gestor = await validarGestorVincis();
  if (!gestor) redirect("/");

  return (
    <GestaoUsuariosPage
      gestorNome={gestor.nome}
      resultadoInicial={await listarUsuariosGestaoQuery(gestor.id)}
    />
  );
}
