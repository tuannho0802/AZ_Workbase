// api/index.ts
// Chuyển tiếp handler từ backend để tránh lỗi thiếu module ở root
import handler from '../backend/src/vercel';

export default handler;
