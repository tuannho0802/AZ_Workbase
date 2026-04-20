/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tối ưu bundle size
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', 'zustand'],
  },

  // Compression
  compress: true,

  // Image optimization
  images: {
    minimumCacheTTL: 3600,
    formats: ['image/webp', 'image/avif'],
  },

  // Output standalone để giảm bundle size trên Vercel
  output: 'standalone',

  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  allowedDevOrigins: ['localhost', '127.0.0.1', '[::1]'],
};
module.exports = nextConfig;
