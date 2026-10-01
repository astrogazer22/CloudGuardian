import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  // Monorepo: trace dependencies hoisted into the root node_modules.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
};

export default nextConfig;
