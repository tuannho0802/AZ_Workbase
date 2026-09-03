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

  // ⚠️ ĐÃ BỎ `output: 'standalone'` - đây là chế độ dành cho SELF-HOST
  // (chạy `node .next/standalone/server.js` trong Docker/VPS riêng), không
  // phải cho Vercel. Vercel có adapter build RIÊNG (@vercel/next), tự đóng
  // gói thành serverless functions từ `.next` build thông thường - không hề
  // chạy standalone server.js. Đặt `output: 'standalone'` khi deploy Vercel
  // là thừa và có thể làm asset tĩnh import trực tiếp (`import logo from
  // '...png'`) resolve sai hash path (không lỗi 404 network vì đây là
  // reference nội bộ, không phải HTTP request) - đúng khớp triệu chứng "ảnh
  // không hiện, không lỗi 404" đang gặp. Nếu sau này cần self-host thật
  // (không dùng Vercel nữa), mới bật lại dòng `output: 'standalone'`.

  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  },
  allowedDevOrigins: ['localhost', '127.0.0.1', '[::1]'],
};
module.exports = nextConfig;