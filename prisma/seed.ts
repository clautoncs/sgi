import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Criar permissões
  const permissions = [
    { code: "dashboard.view", label: "Visualizar Dashboards", module: "dashboard" },
    { code: "dashboard.manage", label: "Gerenciar Dashboards", module: "dashboard" },
    { code: "users.view", label: "Visualizar Usuários", module: "users" },
    { code: "users.manage", label: "Gerenciar Usuários", module: "users" },
    { code: "roles.manage", label: "Gerenciar Permissões", module: "roles" },
    { code: "sources.view", label: "Visualizar Fontes", module: "sources" },
    { code: "sources.manage", label: "Gerenciar Fontes", module: "sources" },
    { code: "settings.view", label: "Visualizar Configurações", module: "settings" },
    { code: "settings.manage", label: "Gerenciar Configurações", module: "settings" },
    { code: "audit.view", label: "Visualizar Auditoria", module: "audit" },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // Criar roles
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: {
      name: "admin",
      label: "Administrador",
      description: "Acesso total ao sistema",
      isSystem: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "manager" },
    update: {},
    create: {
      name: "manager",
      label: "Gerente",
      description: "Gerencia dashboards e fontes",
      isSystem: true,
    },
  });

  const viewerRole = await prisma.role.upsert({
    where: { name: "viewer" },
    update: {},
    create: {
      name: "viewer",
      label: "Visualizador",
      description: "Apenas visualiza dashboards",
      isSystem: true,
    },
  });

  // Vincular todas as permissões ao admin
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Permissões do manager
  const managerPerms = allPerms.filter(p =>
    ["dashboard.view", "dashboard.manage", "sources.view", "sources.manage", "users.view"].includes(p.code)
  );
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: managerRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: managerRole.id, permissionId: perm.id },
    });
  }

  // Permissões do viewer
  const viewerPerms = allPerms.filter(p => p.code === "dashboard.view");
  for (const perm of viewerPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: viewerRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: viewerRole.id, permissionId: perm.id },
    });
  }

  // Criar usuário admin padrão (senha: admin123 - trocar após primeiro login)
  const bcrypt = require("bcryptjs");
  const hashedPassword = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@ilinked.com.br" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@ilinked.com.br",
      password: hashedPassword,
      provider: "local",
      roleId: adminRole.id,
    },
  });

  // Configurações padrão do sistema
  const settings = [
    { key: "app.name", value: "SGI - iLinked", type: "string", group: "general", label: "Nome do Sistema" },
    { key: "app.logo", value: "/logo.png", type: "string", group: "appearance", label: "Logo" },
    { key: "theme.primary_color", value: "#2563eb", type: "string", group: "appearance", label: "Cor Primária" },
    { key: "auth.allow_registration", value: "false", type: "boolean", group: "auth", label: "Permitir Registro" },
    { key: "auth.google_sso", value: "false", type: "boolean", group: "auth", label: "SSO Google Ativo" },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log("   Admin: admin@ilinked.com.br / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
