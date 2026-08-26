import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@reclit/ui", "@reclit/api"],
  // `output: "standalone"` traces imports, not files read at runtime, so the
  // resume has to be declared explicitly or the route 500s in a built image.
  outputFileTracingIncludes: {
    "/resume-document": ["./src/assets/resume.pdf"],
  },
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

export default withNextIntl(config);
