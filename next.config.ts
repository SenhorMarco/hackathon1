import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  partialPrefetching: true,
  outputFileTracingIncludes: {
    '/api/exams/**': ['node_modules/pdfjs-dist/standard_fonts/**', 'node_modules/pdfjs-dist/cmaps/**', 'node_modules/pdfjs-dist/wasm/**', 'node_modules/pdfjs-dist/legacy/build/**', 'node_modules/@napi-rs/canvas-*/**'],
  },
  turbopack: {
    rules: {
      "*.css": {
        // CSS Modules precisam preservar seus nomes de classes e exports.
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
