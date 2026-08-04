import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/",
  },
});

export const config = {
  matcher: [
    /*
     * Protege apenas as rotas internas do sistema:
     * - /dashboard e sub-rotas
     * - /admin e sub-rotas
     * - /settings e sub-rotas
     *
     * Rotas públicas (NÃO protegidas):
     * - / (login)
     * - /status
     * - /api/auth (NextAuth)
     * - /api/health (health check)
     * - /_next (assets)
     */
    "/dashboard/:path*",
    "/admin/:path*",
    "/settings/:path*",
  ],
};
