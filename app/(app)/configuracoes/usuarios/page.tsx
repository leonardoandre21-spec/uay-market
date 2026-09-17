import { exigirAdmin } from "@/lib/auth";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { listarUsuariosComUltimoAcesso } from "@/lib/servicos/configuracoes";
import { GerenciarUsuarios } from "./_componentes/gerenciar-usuarios";

export const dynamic = "force-dynamic";

export default async function PaginaUsuarios() {
  const sessao = await exigirAdmin();
  const usuarios = await listarUsuariosComUltimoAcesso();
  return (
    <GerenciarUsuarios
      adminLogadoId={sessao.usuarioId}
      usuarios={usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        papel: u.papel,
        ativo: u.ativo,
        criadoEm: formatarData(u.criadoEm),
        ultimoAcesso: u.ultimoAcesso ? formatarDataHora(u.ultimoAcesso) : null,
      }))}
    />
  );
}
