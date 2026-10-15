import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/dsa/python-worker.mjs",
        headers: [{
          key: "Content-Security-Policy",
          // The ephemeral worker never needs first-party authenticated API
          // access. Only the pinned Python WASM runtime can be downloaded.
          value: [
            "default-src 'none'",
            "script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'",
            "connect-src https://cdn.jsdelivr.net",
            "worker-src 'none'",
            "object-src 'none'",
          ].join("; "),
        }],
      },
    ];
  },
};

export default nextConfig;
