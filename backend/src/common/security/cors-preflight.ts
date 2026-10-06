/**
 * Trả lời CORS preflight (OPTIONS) NGAY ở handler, TRƯỚC khi khởi tạo Nest.
 *
 * Vì sao: preflight là nguồn của các log status 204. Trên Vercel, nếu instance đang nguội thì
 * mỗi OPTIONS lại kéo theo cả bootstrap Nest (DI + kết nối DB) rồi mới trả 204 rỗng - tốn Active
 * CPU vô ích. Preflight không cần DB/JWT/guard, chỉ cần so origin với danh sách cho phép.
 *
 * Hành vi khớp middleware `cors` (Nest enableCors) để không đổi gì phía trình duyệt.
 */
export interface CorsPreflightConfig {
  allowedOrigins: string[];
  methods: string[];
  allowedHeaders: string[];
  maxAgeSeconds: number;
  credentials: boolean;
}

interface MinimalReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface MinimalRes {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

/** Danh sách origin cho phép - dùng chung cho `enableCors` và preflight sớm (1 nguồn sự thật). */
export function buildAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://az-workbase.vercel.app', // Domain Vercel cũ (giữ lại phòng khi cần)
    'https://www.azworkbase.com', // Domain chính thức mới
    'https://azworkbase.com', // Domain không có www (phòng trường hợp DNS không tự redirect)
  ];
  if (env.VERCEL_URL) origins.push(`https://${env.VERCEL_URL}`);
  if (env.FRONTEND_URL) origins.push(env.FRONTEND_URL);
  return origins;
}

export const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const CORS_ALLOWED_HEADERS = ['Content-Type', 'Authorization'];
// Chrome giới hạn Max-Age tối đa 7200s (Firefox 86400s) - đặt 7200 để Chrome cache preflight lâu nhất có thể.
export const CORS_MAX_AGE_SECONDS = 7200;

const header = (req: MinimalReq, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** Preflight thật = OPTIONS + có `Access-Control-Request-Method`. OPTIONS khác để Nest xử lý như cũ. */
export function isCorsPreflight(req: MinimalReq): boolean {
  return req.method === 'OPTIONS' && !!header(req, 'access-control-request-method');
}

/** Trả 204 kèm header CORS. Chỉ gọi khi `isCorsPreflight(req)` là true. */
export function respondToPreflight(req: MinimalReq, res: MinimalRes, cfg: CorsPreflightConfig): void {
  const origin = header(req, 'origin');
  res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
  if (origin && cfg.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (cfg.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', cfg.methods.join(','));
  res.setHeader('Access-Control-Allow-Headers', cfg.allowedHeaders.join(','));
  res.setHeader('Access-Control-Max-Age', String(cfg.maxAgeSeconds));
  res.setHeader('Content-Length', '0');
  res.statusCode = 204;
  res.end();
}
