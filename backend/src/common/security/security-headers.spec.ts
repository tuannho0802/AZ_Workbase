import express from 'express';
import request from 'supertest';
import { isHtmlPath, securityHeaders } from './security-headers';

describe('securityHeaders (PLAN_HARDENING P3)', () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/api/customers', (_req, res) => res.json({ ok: true }));
  app.get('/api/docs', (_req, res) => res.send('<html></html>'));
  app.get('/', (_req, res) => res.send('<html></html>'));

  it('phân loại đường dẫn HTML vs API', () => {
    expect(isHtmlPath('/api/docs')).toBe(true);
    expect(isHtmlPath('/api/docs-json')).toBe(true);
    expect(isHtmlPath('/')).toBe(true);
    expect(isHtmlPath('/swagger-auth.js')).toBe(true);
    expect(isHtmlPath('/api/customers')).toBe(false);
    expect(isHtmlPath('/iclock/cdata')).toBe(false);
  });

  it('API: CSP khoá chặt + CORP cross-origin + nosniff', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('Swagger/landing: CSP cho phép cdnjs + inline', async () => {
    for (const p of ['/api/docs', '/']) {
      const res = await request(app).get(p);
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain('https://cdnjs.cloudflare.com');
      expect(csp).toContain("'unsafe-inline'");
      expect(csp).not.toContain("default-src 'none'");
    }
  });
});
