import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sécurité headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://res.cloudinary.com https://*.vercel-storage.com",
              "font-src 'self'",
              "connect-src 'self' https://*.vercel-storage.com",
            ].join("; "),
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.vercel-storage.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },

  experimental: {
    serverActions: {
      allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? ""],
    },
  },
};

export default nextConfig;
