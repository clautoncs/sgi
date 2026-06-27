/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera um build "standalone": uma pasta enxuta com só o necessário
  // para rodar em produção. Deixa a imagem Docker pequena e rápida.
  output: 'standalone',
};

module.exports = nextConfig;
