import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
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

  // CORS: Cho phép origin từ biến môi trường + localhost
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
  ];

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

  // Swagger documentation (Tiếng Việt như yêu cầu)
  const config = new DocumentBuilder()
    .setTitle('AZWorkbase API')
    .setDescription('Tài liệu API cho Hệ thống quản lý dữ liệu Marketing AZWorkbase')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Server đang chạy trên cổng ${port}`);
}
bootstrap();
// Last updated: 2026-03-31 10:55
