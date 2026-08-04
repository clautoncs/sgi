const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Criar role sysadmin se não existir
  const sysadminRole = await prisma.role.upsert({
    where: { name: 'sysadmin' },
    update: { description: 'System Administrator - Full Access (all permissions)', label: 'SYS ADMIN' },
    create: {
      name: 'sysadmin',
      label: 'SYS ADMIN',
      description: 'System Administrator - Full Access (all permissions)',
      isSystem: true,
    }
  });
  console.log('Role sysadmin:', sysadminRole);

  // Atribuir todas as permissões à role sysadmin
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: sysadminRole.id, permissionId: perm.id } },
      update: {},
      create: { roleId: sysadminRole.id, permissionId: perm.id }
    });
  }
  console.log('All', allPermissions.length, 'permissions assigned to sysadmin');

  // Atualizar o usuário admin para sysadmin
  const user = await prisma.user.update({
    where: { email: 'admin@ilinked.com.br' },
    data: { name: 'Clauton Sobral', roleId: sysadminRole.id }
  });
  console.log('User updated:', { id: user.id, name: user.name, email: user.email, roleId: user.roleId });
}

main().catch(console.error).finally(() => prisma.$disconnect());
