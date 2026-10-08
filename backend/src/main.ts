// [Mục 12H] PHẢI đứng đầu tiên: nếu TRACE_URL_PARSE=true thì vá url.parse để truy nguồn cảnh báo DEP0169 (mặc định TẮT, không làm gì).
import './common/observability/url-parse-trace';
// PLAN_HARDENING P5: Sentry phải được khởi tạo TRƯỚC mọi import khác.
import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  NestExpressApplication,
  ExpressAdapter,
} from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
// Dùng cú pháp import = require(...) vì cần GỌI express() để tạo app instance
// (import * as express chỉ cho phép dùng như namespace, không gọi được như hàm).
import express = require('express');
import * as fs from 'fs';
import compression from 'compression';
import { securityHeaders } from './common/security/security-headers';
import { createSwaggerBasicAuth } from './common/security/swagger-basic-auth.middleware';
import { swaggerDisabledHandler } from './common/security/swagger-disabled.middleware';
import { AuthService } from './modules/auth/auth.service';
import { cpuTimingMiddleware } from './common/middleware/cpu-timing.middleware';
// [PLAN_CPU_OPTIMIZATION_ROUND2 - Mục 12A/12B] logger bỏ log khởi động Nest + đo thời gian boot (CPU_TIMING=true).
import { QuietBootLogger } from './common/logger/quiet-boot.logger';
import { bootMark, bootStep, isBootTimingEnabled, logBootTiming } from './common/observability/boot-timing';
import {
  buildAllowedOrigins,
  CORS_ALLOWED_HEADERS,
  CORS_MAX_AGE_SECONDS,
  CORS_METHODS,
  isCorsPreflight,
  respondToPreflight,
} from './common/security/cors-preflight';

// ⚠️ Quan trọng cho serverless (Vercel):
// Trước đây main.ts gọi NestFactory.create() + app.listen() mỗi lần module được
// load, không có cơ chế tái sử dụng app instance giữa các lần "warm invocation"
// của cùng 1 container -> làm tăng cold start (phải khởi tạo lại toàn bộ DI
// container + kết nối DB mỗi lần).
// Cách sửa: tạo 1 Express instance dùng chung + cache Promise<app> ở module scope.
// Vì Node.js cache module theo container, các lần gọi tiếp theo trong cùng
// container sẽ dùng lại app đã khởi tạo thay vì tạo mới.
const expressServer = express();
let cachedAppPromise: Promise<NestExpressApplication> | null = null;

async function createApp(): Promise<NestExpressApplication> {
  // [Mục 12B] load = CPU của cả tiến trình tới đây (nạp module); chỉ tính khi CPU_TIMING=true.
  const bootTiming = isBootTimingEnabled();
  const loadUsage = bootTiming ? process.cpuUsage() : undefined;
  const loadCpuMs = loadUsage ? (loadUsage.user + loadUsage.system) / 1000 : 0;
  const bootStart = bootTiming ? bootMark() : undefined;

  // [AGENT] OLD CODE (giữ để rollback):
  // const app = await NestFactory.create<NestExpressApplication>(
  //   AppModule,
  //   new ExpressAdapter(expressServer),
  // );
  // NEW (Mục 12A): QuietBootLogger bỏ ~245 dòng log khởi động mỗi cold start (NEST_BOOT_LOG=true để bật lại).
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressServer),
    { logger: new QuietBootLogger() },
  );
  const createStep = bootStart ? bootStep(bootStart) : undefined;

  // ⚠️ BẮT BUỘC cho rate-limit theo IP (ThrottlerGuard, xem
  // modules/auth/auth.controller.ts): app chạy sau reverse proxy (Vercel edge)
  // - Express mặc định KHÔNG tin header `X-Forwarded-For`, nên `req.ip` luôn
  // trả về IP nội bộ của proxy (GIỐNG NHAU cho MỌI request thật) thay vì IP
  // client thật. Nếu thiếu dòng này, rate-limit theo IP sẽ hoàn toàn sai:
  // hoặc gộp tất cả người dùng chung 1 "IP", hoặc luôn thấy IP rỗng/không ổn
  // định. `trust proxy: 1` báo Express tin đúng 1 lớp proxy phía trước (khớp
  // hạ tầng Vercel - request luôn qua đúng 1 lớp edge trước khi tới hàm
  // serverless), lấy IP thật từ `X-Forwarded-For` do Vercel tự gắn.
  expressServer.set('trust proxy', 1);

  // Compression cho response.
  // [PERF/Fluid CPU] Vercel CDN đã tự nén gzip/brotli theo `Accept-Encoding` (xem
  // docs Vercel "CDN Compression"). Nén thêm ở Node tốn Active CPU mỗi response.
  // Đặt DISABLE_APP_COMPRESSION=true để TẮT (mặc định vẫn bật - hành vi cũ). BẮT BUỘC
  // kiểm `Content-Encoding` ở response thật (preview) trước khi bật ở production:
  //   curl -s -D- -o /dev/null -H "Accept-Encoding: br,gzip" <url>/api/<endpoint-JSON-lớn>
  if (process.env.DISABLE_APP_COMPRESSION !== 'true') {
    app.use(compression());
  }

  // [AGENT] NEW CODE: đo CPU từng endpoint (mặc định TẮT) - xem common/middleware/cpu-timing.middleware.ts.
  // Bật tạm bằng env CPU_TIMING=true trên Vercel, xuất log rồi tắt lại.
  if (process.env.CPU_TIMING === 'true') {
    app.use(cpuTimingMiddleware);
  }

  // PLAN_HARDENING P3: header bảo mật (helmet) - đặt TRƯỚC static/route để mọi
  // response (kể cả file tĩnh, Swagger) đều có header. Xem common/security.
  app.use(securityHeaders);

  // Debug: log process.cwd() để biết path thực tế trên Vercel
  const cwd = process.cwd();
  // [AGENT] OLD CODE (giữ để rollback): console.log(`[Bootstrap] process.cwd() = ${cwd}`);
  // NEW (Mục 12A): chỉ in khi BOOT_DEBUG=true (console.warn khi thiếu public/ vẫn giữ).
  const bootDebug = process.env.BOOT_DEBUG === 'true';
  if (bootDebug) console.log(`[Bootstrap] process.cwd() = ${cwd}`);

  // Dùng __dirname để tìm public/ tương đối với file compiled
  // Trên Vercel: __dirname = /var/task/backend/src
  // public/ nằm ở /var/task/backend/public
  const publicFromDirname = join(__dirname, '..', 'public');
  const publicFromCwd = join(cwd, 'public');

  if (bootDebug) {
    console.log(`[Static] Trying __dirname path: ${publicFromDirname}`);
    console.log(`[Static] Trying cwd path: ${publicFromCwd}`);
  }

  // Thử cả 2 path, dùng cái nào tồn tại
  let publicPath: string | null = null;
  if (fs.existsSync(publicFromDirname)) {
    publicPath = publicFromDirname;
    if (bootDebug) console.log(`[Static] ✅ Found at __dirname path`);
  } else if (fs.existsSync(publicFromCwd)) {
    publicPath = publicFromCwd;
    if (bootDebug) console.log(`[Static] ✅ Found at cwd path`);
  } else {
    console.warn(`[Static] ❌ public/ not found at either path!`);
  }

  if (publicPath) {
    // useStaticAssets = NestExpressApplication method, đúng hơn express.static
    app.useStaticAssets(publicPath);
    if (bootDebug) console.log(`[Static] Serving from: ${publicPath}`);
  }

  // ✅ Luôn thêm prefix 'api' - TRỪ nhóm route /iclock/* (ADMS Push).
  // Lý do: máy chấm công ZKTeco gọi CỨNG đường dẫn /iclock/cdata theo đúng
  // giao thức gốc - menu cấu hình trên máy chỉ nhập được host+port, không có
  // chỗ nào để thêm prefix "/api". Nếu để prefix áp cả vào route này, máy sẽ
  // luôn nhận 404 vì gọi sai đường dẫn thật (/iclock/cdata thay vì
  // /api/iclock/cdata) mà không có cách nào tự sửa từ phía máy.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'iclock/*path', method: RequestMethod.ALL }],
  });

  // 🔌 ADMS Push (máy chấm công): body-parser mặc định của Nest chỉ hiểu
  // application/json và x-www-form-urlencoded. Máy gửi log dạng text/plain
  // (đôi khi thiếu hẳn Content-Type) nên cần parser text riêng cho đúng route
  // này - `type: () => true` ép parse MỌI content-type thành string, tránh
  // req.body rỗng/undefined bất kể máy gửi header gì.
  // Đăng ký TRƯỚC app.init() để middleware này chạy trước khi Nest routing xử lý.
  // ⚠️ Path KHÔNG có prefix /api (xem lý do ở setGlobalPrefix bên trên).
  app.use('/iclock/cdata', express.text({ type: () => true, limit: '2mb' }));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // 🔥 CORS: Cho phép origin từ biến môi trường + localhost
  // [AGENT] OLD CODE: allowedOrigins khai báo inline ở đây (đã chuyển sang buildAllowedOrigins để preflight sớm dùng chung)
  const allowedOrigins = buildAllowedOrigins();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    // ⚠️ MỚI (2026-09-23): thêm 'Content-Disposition' - dù FE hiện KHÔNG
    // còn phụ thuộc header này để đặt tên file export nữa (đã đổi sang tự
    // dựng tên ở FE, xem customers-export.api.ts), việc thiếu header này
    // trong whitelist CORS chính là lý do gốc khiến `response.headers`
    // luôn rỗng phía trình duyệt cho MỌI request cross-origin (FE/BE khác
    // domain) trả file đính kèm - thêm vào đây để không lặp lại lỗi tương
    // tự nếu sau này có chỗ khác thử đọc lại header này.
    exposedHeaders: ['Authorization', 'Content-Disposition'],
    // [AGENT] OLD CODE: maxAge: 3600
    maxAge: CORS_MAX_AGE_SECONDS,
  });

  // PLAN_HARDENING P4: Swagger chỉ vào được sau khi đăng nhập Basic (tài khoản thật, role admin).
  // Đặt SwaggerModule.setup SAU middleware này để mọi route /api/docs* đi qua nó trước.
  // Tuỳ chọn: SWAGGER_ENABLED=false để tắt hẳn Swagger (mặc định bật).
  if (process.env.SWAGGER_ENABLED !== 'false') {
    const authService = app.get(AuthService);
    app.use(
      createSwaggerBasicAuth({
        verify: (email, password) => authService.verifySwaggerAdmin(email, password),
      }),
    );

    // backend/src/main.ts (phần Swagger)
    const config = new DocumentBuilder()
      .setTitle('AZWorkbase API')
      .setDescription(
        'Tài liệu API cho Hệ thống quản lý dữ liệu Marketing AZWorkbase',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // 🔥 Cấu hình Swagger UI tải từ CDN để tránh lỗi 404 trên Vercel
    SwaggerModule.setup('api/docs', app, document, {
      customCssUrl: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
      ],
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js',
        '/swagger-auth.js', // ✅ THÊM DÒNG NÀY – file tĩnh từ thư mục public
      ],
    });
  } else {
    // SWAGGER_ENABLED=false: trả trang 404 thân thiện cho /api/docs* (HTML cho trình duyệt, JSON cho client khác).
    app.use(swaggerDisabledHandler);
  }

  const initStart = bootTiming ? bootMark() : undefined;
  await app.init();
  if (bootStart && createStep && initStart) {
    logBootTiming(loadCpuMs, createStep, bootStep(initStart), bootStep(bootStart).wallMs);
  }
  return app;
}

/**
 * Lấy app instance, tạo mới nếu chưa có (cold start), tái sử dụng nếu đã có
 * (warm invocation) - tránh khởi tạo lại DI container + kết nối DB mỗi request.
 */
function getApp(): Promise<NestExpressApplication> {
  if (!cachedAppPromise) {
    cachedAppPromise = createApp();
  }
  return cachedAppPromise;
}

// ===== Chạy local / server truyền thống (npm run start:dev, start:prod...) =====
// Trên Vercel, biến môi trường VERCEL luôn = '1' (đã dùng ở database.config.ts),
// nên chỉ gọi app.listen() khi KHÔNG chạy trên Vercel.
async function bootstrap() {
  const app = await getApp();
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Server đang chạy trên cổng ${port}`);
}

if (process.env.VERCEL !== '1') {
  bootstrap();
}

// ===== Handler cho Vercel Serverless Function (@vercel/node) =====
// @vercel/node nhận diện file có default export dạng (req, res) => và dùng nó
// làm request handler thay vì phải bind cổng TCP như app.listen().
export default async function handler(req: any, res: any) {
  // [PERF/Fluid CPU] Trả lời preflight (OPTIONS -> 204) TRƯỚC khi khởi tạo Nest: không cần DB/JWT/guard,
  // tránh bootstrap cả app chỉ để trả 204 rỗng khi instance nguội. Request khác đi đường cũ.
  if (isCorsPreflight(req)) {
    respondToPreflight(req, res, {
      allowedOrigins: buildAllowedOrigins(),
      methods: CORS_METHODS,
      allowedHeaders: CORS_ALLOWED_HEADERS,
      maxAgeSeconds: CORS_MAX_AGE_SECONDS,
      credentials: true,
    });
    return;
  }
  await getApp(); // đảm bảo app đã init (cache theo container)
  expressServer(req, res);
}
// Last updated: 2026-03-31 10:55