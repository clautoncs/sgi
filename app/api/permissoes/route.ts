import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ROLES_FILE = path.join(process.cwd(), 'roles.json');

interface Permission {
  page: string;
  label: string;
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
  permissions: Permission[];
  createdAt: string;
}

interface RolesDB {
  roles: RoleData[];
  pages: { code: string; label: string; module: string }[];
}

async function readRoles(): Promise<RolesDB> {
  try {
    const data = await fs.readFile(ROLES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { roles: [], pages: [] };
  }
}

async function writeRoles(db: RolesDB): Promise<void> {
  await fs.writeFile(ROLES_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// GET - Listar perfis e permissões
export async function GET() {
  try {
    const db = await readRoles();
    return NextResponse.json(db);
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao buscar permissões', details: error.message }, { status: 500 });
  }
}

// POST - Criar/atualizar perfis
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...data } = body;
    const db = await readRoles();

    if (action === 'create_role') {
      const exists = db.roles.find(r => r.name === data.name);
      if (exists) return NextResponse.json({ error: 'Perfil já existe' }, { status: 400 });
      
      // Criar com todas as permissões desabilitadas por padrão
      const newRole: RoleData = {
        id: `role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: data.name,
        label: data.label || data.name,
        description: data.description || '',
        isSystem: false,
        permissions: db.pages.map(p => ({
          page: p.code,
          label: p.label,
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

    if (action === 'update_role') {
      const role = db.roles.find(r => r.id === data.id);
      if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
      if (data.label) role.label = data.label;
      if (data.description) role.description = data.description;
      if (data.permissions) role.permissions = data.permissions;
      await writeRoles(db);
      return NextResponse.json({ success: true, role });
    }

    if (action === 'delete_role') {
      const role = db.roles.find(r => r.id === data.id);
      if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
      if (role.isSystem) return NextResponse.json({ error: 'Perfis do sistema não podem ser deletados' }, { status: 403 });
      db.roles = db.roles.filter(r => r.id !== data.id);
      await writeRoles(db);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao processar', details: error.message }, { status: 500 });
  }
}
