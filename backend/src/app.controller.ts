import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

@Controller()
export class AppController {
  @Get()
  getLandingPage(@Res() res: Response): void {
    try {
      const filePath = join(process.cwd(), 'public', 'index.html');

      if (existsSync(filePath)) {
        const html = readFileSync(filePath, 'utf-8');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } else {
        res.status(404).send('Landing page not found');
      }
    } catch (error) {
      res.status(500).send('Internal server error');
    }
  }
}