/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "react-icons", "date-fns"],
  },
  transpilePackages: ["@repo/ui", "@repo/api"],
  serverExternalPackages: ["pino"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
    ];
  },
};

export default config;
