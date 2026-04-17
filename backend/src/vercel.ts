import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express = require('express');
import { AppModule } from './app.module';

const server = express();
let app: any;

export async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    app.setGlobalPrefix('api');
    app.enableCors({
      origin: [
        'http://localhost:3000',
        'https://az-workbase.vercel.app',
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    await app.init();
  }
  return { app, server };
}

export default async (req: any, res: any) => {
  const { server: srv } = await bootstrap();
  return srv(req, res);
};
