import type { NextConfig } from 'next';

// Keep a running dev server from overwriting the production build (and vice versa).
const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};
export default nextConfig;
