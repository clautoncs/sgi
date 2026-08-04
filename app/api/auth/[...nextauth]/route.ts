import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials): Promise<any> {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email e senha são obrigatórios");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { role: true },
        });

        if (!user || !user.isActive) {
          throw new Error("Credenciais inválidas");
        }

        if (!user.password) {
          throw new Error("Use o login via Google para esta conta");
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Credenciais inválidas");
        }

        // Atualizar último login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatar,
          role: user.role.name,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }): Promise<boolean> {
      if (account?.provider === "google") {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });

        if (existingUser) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              lastLoginAt: new Date(),
              avatar: user.image || existingUser.avatar,
              provider: "google",
              providerId: account.providerAccountId,
            },
          });
        } else {
          const viewerRole = await prisma.role.findFirst({
            where: { name: "viewer" },
          });

          await prisma.user.create({
            data: {
              name: user.name || "Usuário Google",
              email: user.email!,
              avatar: user.image,
              provider: "google",
              providerId: account.providerAccountId,
              roleId: viewerRole?.id || "",
            },
          });
        }
      }
      return true;
    },
    async jwt({ token, user }): Promise<any> {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          include: { role: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role.name;
        }
      }
      return token;
    },
    async session({ session, token }): Promise<any> {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
