/**
 * PLAN_HARDENING P5 - Kiểm tra Sentry phía BE trên máy local.
 *
 * Chạy:  npm run sentry:smoke
 * Cần:   file `.env.sentry-local` (copy từ `.env.sentry-local.example`, điền SENTRY_DSN
 *        của project Sentry TEST - đừng dùng project production).
 *
 * Script gửi 1 event giả có chứa PII (SĐT, email, Bearer token, user, extra) qua ĐÚNG
 * hàm `scrubEvent` mà `instrument.ts` dùng, in event đã lọc ra console, rồi báo mã HTTP
 * THẬT mà Sentry trả về. KHÔNG tin `Sentry.flush()`: nó trả true cả khi mạng bị chặn.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/nestjs';
import { scrubEvent } from '../src/common/observability/sentry-scrub';

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<number> {
  loadEnvFile(path.resolve(__dirname, '..', '.env.sentry-local'));

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.error(
      'THẤT BẠI: thiếu SENTRY_DSN. Copy .env.sentry-local.example -> .env.sentry-local rồi điền DSN của project BE test.',
    );
    return 1;
  }

  // Ghi lại mã HTTP thật từ Sentry (undefined = không nhận được phản hồi nào).
  let httpStatus: number | undefined;
  let transportError: unknown;

  Sentry.init({
    dsn,
    enabled: true,
    environment: 'local',
    release: 'sentry-smoke-local',
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    integrations: (defaults) =>
      defaults.filter((i) => i.name !== 'ContextLines'),
    beforeSend: (event) => {
      const scrubbed = scrubEvent(event);
      console.log('--- Event SAU KHI lọc PII (đây là thứ được gửi đi) ---');
      console.log(
        JSON.stringify(
          {
            message: scrubbed.message,
            exception: scrubbed.exception?.values?.map((v) => v.value),
            hasUser: scrubbed.user !== undefined,
            hasExtra: scrubbed.extra !== undefined,
            request: scrubbed.request,
          },
          null,
          2,
        ),
      );
      return scrubbed;
    },
    transport: (options) => {
      const inner = Sentry.makeNodeTransport(options);
      return {
        ...inner,
        send: async (envelope) => {
          try {
            const res = await inner.send(envelope);
            httpStatus = res.statusCode;
            return res;
          } catch (err) {
            transportError = err;
            throw err;
          }
        },
      };
    },
  });

  Sentry.setUser({
    id: '1',
    email: 'khach@example.com',
    ip_address: '1.2.3.4',
  });
  Sentry.setExtra('customerPhone', '0901234567');
  Sentry.captureException(
    new Error(
      'SMOKE test local: SĐT 0901234567, email khach@example.com, Authorization Bearer abc.def.ghi',
    ),
  );

  await Sentry.flush(8000);
  await Sentry.close(2000);

  if (httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300) {
    console.log(`\nOK - Sentry nhận event (HTTP ${httpStatus}).`);
    console.log(
      'Trên Sentry: tìm "SMOKE", lọc environment:local. Message phải có [Filtered], và KHÔNG có user/SĐT/email/token.',
    );
    return 0;
  }

  const detail =
    httpStatus !== undefined
      ? `HTTP ${httpStatus} (DSN sai/đã bị thu hồi, hoặc project bị khoá quota)`
      : `không nhận được phản hồi từ Sentry${transportError instanceof Error ? `: ${transportError.message}` : ' (mạng/VPN/firewall chặn *.ingest.*.sentry.io, hoặc DSN sai định dạng)'}`;
  console.error(`\nTHẤT BẠI - ${detail}.`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('THẤT BẠI - lỗi không mong đợi:', err);
    process.exit(1);
  },
);
