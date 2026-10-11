import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Run night loads Viktor's agent inside the route; ship its system prompt
  // with that function (agent.ts reads it from disk at startup).
  outputFileTracingIncludes: {
    "/api/agent/run-night": ["./agent/prompt.md"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
