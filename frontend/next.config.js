/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  allowedDevOrigins: ['localhost', '127.0.0.1', '[::1]'],
};
module.exports = nextConfig;
