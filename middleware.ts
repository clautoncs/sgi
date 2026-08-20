import { withAuth } from "next-auth/middleware";
export default withAuth({
  pages: {
    signIn: "/",
  },
});
export const config = {
  matcher: [
    /*
     * Protege as rotas internas do sistema:
     * - /dashboard e sub-rotas (vendas)
     * - /estoque e sub-rotas (catálogo, pedidos, proposta)
     * - /configuracoes e sub-rotas (metas, usuarios, permissoes, integracoes)
     *
     * Rotas públicas (NÃO protegidas):
     * - / (login)
     * - /status
     * - /api (todas as APIs)
     * - /_next (assets)
     */
    "/dashboard/:path*",
    "/estoque/:path*",
    "/configuracoes/:path*", "/shopee/:path*",
  ],
};
