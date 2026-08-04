import { PrismaClient } from '@prisma/client';

// Reaproveita a mesma conexão em vez de abrir uma nova a cada requisição.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
