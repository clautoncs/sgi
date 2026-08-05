import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });

    const roles = await prisma.role.findMany({
      orderBy: { name: 'asc' },
    });

    const formattedUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      provider: u.provider || 'local',
      role: u.role.label,
      roleId: u.roleId,
      roleName: u.role.name,
      isActive: u.isActive,
      isApproved: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() || null,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ users: formattedUsers, roles });
  } catch (error: any) {
    console.error('Erro ao buscar usuários:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...userData } = body;

    if (action === 'create') {
      const { name, email, role: roleId, password } = userData;
      
      if (!name || !email) {
        return NextResponse.json({ error: 'Nome e email são obrigatórios' }, { status: 400 });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 });
      }

      // Buscar role pelo nome ou ID
      let targetRole = await prisma.role.findFirst({ where: { id: roleId } });
      if (!targetRole) {
        targetRole = await prisma.role.findFirst({ where: { name: roleId } });
      }
      if (!targetRole) {
        targetRole = await prisma.role.findFirst({ where: { name: 'viewer' } });
      }

      const hashedPassword = password ? await hash(password, 12) : null;

      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          provider: 'local',
          isActive: true,
          roleId: targetRole!.id,
        },
        include: { role: true },
      });

      return NextResponse.json({ 
        success: true, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          provider: user.provider,
          isActive: user.isActive,
          isApproved: true,
          role: user.role.label,
          roleId: user.roleId,
          roleName: user.role.name,
          createdAt: user.createdAt.toISOString(),
        }
      });
    }

    if (action === 'update') {
      const { id, name, role: roleId } = userData;
      
      if (!id) {
        return NextResponse.json({ error: 'ID do usuário é obrigatório' }, { status: 400 });
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (roleId) {
        let targetRole = await prisma.role.findFirst({ where: { id: roleId } });
        if (!targetRole) {
          targetRole = await prisma.role.findFirst({ where: { name: roleId } });
        }
        if (targetRole) updateData.roleId = targetRole.id;
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        include: { role: true },
      });

      return NextResponse.json({ success: true, user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.label,
        roleId: user.roleId,
      }});
    }

    if (action === 'approve') {
      const { id } = userData;
      await prisma.user.update({
        where: { id },
        data: { isActive: true },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'block') {
      const { id } = userData;
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const { id } = userData;
      // Deletar sessões primeiro
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro na ação de usuário:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
