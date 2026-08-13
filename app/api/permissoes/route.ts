import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const ROLES_FILE = path.join(process.cwd(), "roles.json");

interface Permission {
  page: string;
  view: boolean;
  edit: boolean;
  manage: boolean;
}

interface RoleData {
  id: string;
  name: string;
  label: string;
  description: string;
  isSystem: boolean;
  estoqueProfile: string;
  permissions: Permission[];
  createdAt: string;
}

interface EstoqueProfile {
  code: string;
  label: string;
  description: string;
}

interface RolesDB {
  defaultRole: string;
  defaultEstoqueProfile: string;
  pages: { code: string; label: string; module: string }[];
  estoqueProfiles: EstoqueProfile[];
  roles: RoleData[];
}

async function readRoles(): Promise<RolesDB> {
  try {
    const data = await fs.readFile(ROLES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      defaultRole: "role_viewer",
      defaultEstoqueProfile: "varejo",
      pages: [],
      estoqueProfiles: [],
      roles: [],
    };
  }
}

async function writeRoles(db: RolesDB): Promise<void> {
  await fs.writeFile(ROLES_FILE, JSON.stringify(db, null, 2), "utf-8");
}

// GET - Listar perfis, permissões e configurações
export async function GET() {
  try {
    const db = await readRoles();
    return NextResponse.json(db);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erro ao buscar permissões", details: error.message },
      { status: 500 }
    );
  }
}

// POST - Criar/atualizar perfis e configurações
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...data } = body;
    const db = await readRoles();

    if (action === "create_role") {
      const exists = db.roles.find((r) => r.name === data.name);
      if (exists)
        return NextResponse.json({ error: "Perfil já existe" }, { status: 400 });

      const newRole: RoleData = {
        id: `role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: data.name,
        label: data.label || data.name,
        description: data.description || "",
        isSystem: false,
        estoqueProfile: data.estoqueProfile || db.defaultEstoqueProfile || "varejo",
        permissions: db.pages.map((p) => ({
          page: p.code,
          view: false,
          edit: false,
          manage: false,
        })),
        createdAt: new Date().toISOString(),
      };
      db.roles.push(newRole);
      await writeRoles(db);
      return NextResponse.json({ success: true, role: newRole });
    }

    if (action === "update_role") {
      const role = db.roles.find((r) => r.id === data.id);
      if (!role)
        return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });

      if (data.label !== undefined) role.label = data.label;
      if (data.description !== undefined) role.description = data.description;
      if (data.estoqueProfile !== undefined) role.estoqueProfile = data.estoqueProfile;
      if (data.permissions) role.permissions = data.permissions;
      await writeRoles(db);
      return NextResponse.json({ success: true, role });
    }

    if (action === "delete_role") {
      const role = db.roles.find((r) => r.id === data.id);
      if (!role)
        return NextResponse.json({ error: "Perfil não encontrado" }, { status: 404 });
      if (role.isSystem)
        return NextResponse.json(
          { error: "Perfis do sistema não podem ser deletados" },
          { status: 403 }
        );
      db.roles = db.roles.filter((r) => r.id !== data.id);
      await writeRoles(db);
      return NextResponse.json({ success: true });
    }

    if (action === "update_defaults") {
      if (data.defaultRole) db.defaultRole = data.defaultRole;
      if (data.defaultEstoqueProfile) db.defaultEstoqueProfile = data.defaultEstoqueProfile;
      await writeRoles(db);
      return NextResponse.json({ success: true });
    }

    if (action === "add_page") {
      const exists = db.pages.find((p) => p.code === data.code);
      if (exists)
        return NextResponse.json({ error: "Página já existe" }, { status: 400 });
      db.pages.push({ code: data.code, label: data.label, module: data.module });
      // Adicionar permissão em todos os roles
      for (const role of db.roles) {
        role.permissions.push({ page: data.code, view: false, edit: false, manage: false });
      }
      await writeRoles(db);
      return NextResponse.json({ success: true });
    }

    if (action === "remove_page") {
      db.pages = db.pages.filter((p) => p.code !== data.code);
      for (const role of db.roles) {
        role.permissions = role.permissions.filter((p) => p.page !== data.code);
      }
      await writeRoles(db);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erro ao processar", details: error.message },
      { status: 500 }
    );
  }
}
