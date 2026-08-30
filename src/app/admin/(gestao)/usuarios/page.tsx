import { GestaoUsuariosPage } from "@/features/usuarios/components/gestao/GestaoUsuariosPage";
import { exigirGestorDaPlataforma } from "@/features/admin/lib/exigir-gestor";
import { listarUsuariosGestaoQuery } from "@/features/usuarios/queries/listar-usuarios-gestao";

export default async function GestaoUsuariosRoute() {
  const gestor = await exigirGestorDaPlataforma();

  return (
    <GestaoUsuariosPage
      gestorNome={gestor.nome}
      resultadoInicial={await listarUsuariosGestaoQuery(gestor.id)}
    />
  );
}
