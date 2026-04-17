// backend/src/AppFactory.ts
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Request, Response } from 'express';
import { Express } from 'express';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';

export class AppFactory {
    static create(): {
        appPromise: Promise<INestApplication<any>>;
        expressApp: Express;
    } {
        const expressApp = express();
        const adapter = new ExpressAdapter(expressApp);

        const appPromise = NestFactory.create(AppModule, adapter);

        appPromise
            .then((app) => {
                // Bật CORS
                app.enableCors({
                    origin: [
                        'http://localhost:3000',
                        'https://az-workbase.vercel.app', // Thay bằng domain thật của bạn
                    ],
                    credentials: true,
                    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
                    allowedHeaders: ['Content-Type', 'Authorization'],
                });
                app.init();
            })
            .catch((err) => {
                console.error('Failed to initialize NestJS app:', err);
                throw err;
            });

        // Middleware này đảm bảo ứng dụng NestJS đã sẵn sàng trước khi xử lý request
        expressApp.use((req: Request, res: Response, next) => {
            appPromise
                .then(async (app) => {
                    await app.init();
                    next();
                })
                .catch((err) => next(err));
        });

        return { appPromise, expressApp };
    }
}