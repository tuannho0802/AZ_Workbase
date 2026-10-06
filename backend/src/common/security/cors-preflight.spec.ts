import {
  buildAllowedOrigins,
  isCorsPreflight,
  respondToPreflight,
  CorsPreflightConfig,
  CORS_METHODS,
  CORS_ALLOWED_HEADERS,
} from './cors-preflight';

const cfg: CorsPreflightConfig = {
  allowedOrigins: ['https://azworkbase.com'],
  methods: CORS_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  maxAgeSeconds: 7200,
  credentials: true,
};

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    ended: false,
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    end() {
      this.ended = true;
    },
  };
}

describe('cors-preflight', () => {
  it('chỉ nhận OPTIONS có Access-Control-Request-Method', () => {
    expect(isCorsPreflight({ method: 'OPTIONS', headers: { 'access-control-request-method': 'GET' } })).toBe(true);
    expect(isCorsPreflight({ method: 'OPTIONS', headers: {} })).toBe(false);
    expect(isCorsPreflight({ method: 'GET', headers: { 'access-control-request-method': 'GET' } })).toBe(false);
  });

  it('origin hợp lệ -> 204 + Allow-Origin + Credentials + Max-Age', () => {
    const res = fakeRes();
    respondToPreflight({ method: 'OPTIONS', headers: { origin: 'https://azworkbase.com' } }, res, cfg);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://azworkbase.com');
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(res.headers['Access-Control-Max-Age']).toBe('7200');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('origin lạ -> 204 nhưng KHÔNG có Allow-Origin/Credentials (trình duyệt tự chặn)', () => {
    const res = fakeRes();
    respondToPreflight({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res, cfg);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(res.headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('buildAllowedOrigins thêm VERCEL_URL và FRONTEND_URL khi có', () => {
    const o = buildAllowedOrigins({ VERCEL_URL: 'x.vercel.app', FRONTEND_URL: 'https://f.example' } as NodeJS.ProcessEnv);
    expect(o).toEqual(expect.arrayContaining(['https://x.vercel.app', 'https://f.example', 'https://azworkbase.com']));
    expect(buildAllowedOrigins({} as NodeJS.ProcessEnv)).not.toContain('https://undefined');
  });
});
