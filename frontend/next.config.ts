import type { NextConfig } from "next";

// En développement, Next relaie /api vers FastAPI (même origine → cookies httpOnly OK).
// En production, Nginx route /api vers le backend et le reste vers Next.
const backend = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8100";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Le badge flottant de Next (dev) masquait du contenu en bas à gauche.
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
