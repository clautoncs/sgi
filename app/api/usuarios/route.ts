import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { promises as fs } from "fs";
import path from "path";

// Ler configuração de perfil padrão do roles.json
async function getDefaultRole(): Promise<string> {
  try {
    const rolesFile = path.join(process.cwd(), "roles.json");
    const data = await fs.readFile(rolesFile, "utf-8");
    const db = JSON.parse(data);
    // defaultRole armazena o ID do role (ex: "role_viewer")
    // Mas no banco usamos o name (ex: "viewer")
    const defaultRoleId = db.defaultRole || "role_viewer";
    const role = db.roles?.find((r: any) => r.id === defaultRoleId);
    return role?.name || "viewer";
  } catch {
    return "viewer";
  }
}

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { createdAt: "desc" },
    });
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
    });
    const formattedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      provider: u.provider || "local",
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
    console.error("Erro ao buscar usuários:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...userData } = body;

    if (action === "create") {
      const { name, email, role: roleId, password } = userData;
      if (!name || !email) {
        return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json({ error: "Email já cadastrado" }, { status: 400 });
      }

      // Buscar role: primeiro pelo ID fornecido, depois pelo nome, senão usa o padrão
      let targetRole = null;
      if (roleId) {
        targetRole = await prisma.role.findFirst({ where: { id: roleId } });
        if (!targetRole) {
          targetRole = await prisma.role.findFirst({ where: { name: roleId } });
        }
      }
      if (!targetRole) {
        const defaultRoleName = await getDefaultRole();
        targetRole = await prisma.role.findFirst({ where: { name: defaultRoleName } });
      }
      if (!targetRole) {
        targetRole = await prisma.role.findFirst({ where: { name: "viewer" } });
      }

      const hashedPassword = password ? await hash(password, 12) : null;
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          provider: "local",
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
        },
      });
    }

    if (action === "update") {
      const { id, name, role: roleId, password, provider } = userData;
      if (!id) {
        return NextResponse.json({ error: "ID do usuário é obrigatório" }, { status: 400 });
      }
      const updateData: any = {};
      if (name) updateData.name = name;
      if (provider) updateData.provider = provider;
      if (password && password.trim()) {
        updateData.password = await hash(password, 12);
      }
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
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.label,
          roleId: user.roleId,
          provider: user.provider,
        },
      });
    }

    if (action === "approve") {
      const { id } = userData;
      await prisma.user.update({
        where: { id },
        data: { isActive: true },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "block") {
      const { id } = userData;
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const { id } = userData;
      await prisma.session.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    console.error("Erro na ação de usuário:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
