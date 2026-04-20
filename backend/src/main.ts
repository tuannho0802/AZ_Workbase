import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import * as express from 'express';
import * as fs from 'fs';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // ✅ Luôn thêm prefix 'api' - KHÔNG cần điều kiện
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // 🔥 CORS: Cho phép origin từ biến môi trường + localhost
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'https://az-workbase.vercel.app', // Thay bằng URL thực tế của bạn
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
    .setDescription('Tài liệu API cho Hệ thống quản lý dữ liệu Marketing AZWorkbase')
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

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Server đang chạy trên cổng ${port}`);
}
bootstrap();
// Last updated: 2026-03-31 10:55
