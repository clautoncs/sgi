import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Protege todas as rotas EXCETO:
     * - /login
     * - /api/auth (NextAuth)
     * - /api/health (health check)
     * - /_next (assets)
     * - /favicon.ico, /public
     */
    "/((?!login|api/auth|api/health|_next|favicon.ico|public).*)",
  ],
};
