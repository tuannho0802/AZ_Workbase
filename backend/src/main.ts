import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ✅ Serve static files from public folder
  app.useStaticAssets(join(process.cwd(), 'public'));

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
