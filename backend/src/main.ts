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
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressServer),
  );

  // Compression cho response
  app.use(compression());

  // Debug: log process.cwd() để biết path thực tế trên Vercel
  const cwd = process.cwd();
  console.log(`[Bootstrap] process.cwd() = ${cwd}`);

  // Dùng __dirname để tìm public/ tương đối với file compiled
  // Trên Vercel: __dirname = /var/task/backend/src
  // public/ nằm ở /var/task/backend/public
  const publicFromDirname = join(__dirname, '..', 'public');
  const publicFromCwd = join(cwd, 'public');

  console.log(`[Static] Trying __dirname path: ${publicFromDirname}`);
  console.log(`[Static] Trying cwd path: ${publicFromCwd}`);

  // Thử cả 2 path, dùng cái nào tồn tại
  let publicPath: string | null = null;
  if (fs.existsSync(publicFromDirname)) {
    publicPath = publicFromDirname;
    console.log(`[Static] ✅ Found at __dirname path`);
  } else if (fs.existsSync(publicFromCwd)) {
    publicPath = publicFromCwd;
    console.log(`[Static] ✅ Found at cwd path`);
  } else {
    console.warn(`[Static] ❌ public/ not found at either path!`);
  }

  if (publicPath) {
    // useStaticAssets = NestExpressApplication method, đúng hơn express.static
    app.useStaticAssets(publicPath);
    console.log(`[Static] Serving from: ${publicPath}`);
  }

  // ✅ Luôn thêm prefix 'api' - TRỪ nhóm route /iclock/* (ADMS Push).
  // Lý do: máy chấm công ZKTeco gọi CỨNG đường dẫn /iclock/cdata theo đúng
  // giao thức gốc - menu cấu hình trên máy chỉ nhập được host+port, không có
  // chỗ nào để thêm prefix "/api". Nếu để prefix áp cả vào route này, máy sẽ
  // luôn nhận 404 vì gọi sai đường dẫn thật (/iclock/cdata thay vì
  // /api/iclock/cdata) mà không có cách nào tự sửa từ phía máy.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'iclock/(.*)', method: RequestMethod.ALL }],
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
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://az-workbase.vercel.app', // Domain Vercel cũ (giữ lại phòng khi cần)
    'https://www.azworkbase.com', // Domain chính thức mới
    'https://azworkbase.com', // Domain không có www (phòng trường hợp DNS không tự redirect)
  ];

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    allowedOrigins.push(`https://${vercelUrl}`);
  }

  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    allowedOrigins.push(frontendUrl);
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    maxAge: 3600,
  });

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

  await app.init();
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
  await getApp(); // đảm bảo app đã init (cache theo container)
  expressServer(req, res);
}
// Last updated: 2026-03-31 10:55