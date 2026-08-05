import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'users.json');

interface UserData {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  provider: 'local' | 'google';
  role: string;
  isActive: boolean;
  isApproved: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface UsersDB {
  users: UserData[];
}

async function readUsers(): Promise<UsersDB> {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { users: [] };
  }
}

async function writeUsers(db: UsersDB): Promise<void> {
  await fs.writeFile(USERS_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// GET - Listar todos os usuários
export async function GET() {
  try {
    const db = await readUsers();
    return NextResponse.json(db);
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao buscar usuários', details: error.message }, { status: 500 });
  }
}

// POST - Criar ou atualizar usuário
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...userData } = body;
    const db = await readUsers();

    if (action === 'create') {
      const exists = db.users.find(u => u.email === userData.email);
      if (exists) {
        return NextResponse.json({ error: 'Usuário já existe com este email' }, { status: 400 });
      }
      const newUser: UserData = {
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: userData.name,
        email: userData.email,
        avatar: userData.avatar || '',
        provider: userData.provider || 'local',
        role: userData.role || 'viewer',
        isActive: true,
        isApproved: userData.provider === 'local' ? true : false,
        createdAt: new Date().toISOString(),
      };
      db.users.push(newUser);
      await writeUsers(db);
      return NextResponse.json({ success: true, user: newUser });
    }

    if (action === 'approve') {
      const user = db.users.find(u => u.id === userData.id);
      if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      user.isApproved = true;
      user.isActive = true;
      await writeUsers(db);
      return NextResponse.json({ success: true, user });
    }

    if (action === 'block') {
      const user = db.users.find(u => u.id === userData.id);
      if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      user.isActive = false;
      user.isApproved = false;
      await writeUsers(db);
      return NextResponse.json({ success: true, user });
    }

    if (action === 'update') {
      const user = db.users.find(u => u.id === userData.id);
      if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
      if (userData.name) user.name = userData.name;
      if (userData.role) user.role = userData.role;
      if (userData.isActive !== undefined) user.isActive = userData.isActive;
      if (userData.isApproved !== undefined) user.isApproved = userData.isApproved;
      await writeUsers(db);
      return NextResponse.json({ success: true, user });
    }

    if (action === 'delete') {
      db.users = db.users.filter(u => u.id !== userData.id);
      await writeUsers(db);
      return NextResponse.json({ success: true });
    }

    // Registrar tentativa de login SSO (chamado pelo NextAuth callback)
    if (action === 'sso_attempt') {
      const existing = db.users.find(u => u.email === userData.email);
      if (!existing) {
        const newUser: UserData = {
          id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: userData.name,
          email: userData.email,
          avatar: userData.avatar || '',
          provider: 'google',
          role: 'viewer',
          isActive: false,
          isApproved: false,
          lastLoginAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        db.users.push(newUser);
        await writeUsers(db);
        return NextResponse.json({ success: true, approved: false, user: newUser });
      }
      existing.lastLoginAt = new Date().toISOString();
      if (userData.avatar) existing.avatar = userData.avatar;
      await writeUsers(db);
      return NextResponse.json({ success: true, approved: existing.isApproved, user: existing });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao processar', details: error.message }, { status: 500 });
  }
}
