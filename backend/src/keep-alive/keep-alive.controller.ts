import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('keep-alive')
export class KeepAliveController {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) { }

    @Get()
    async ping() {
        try {
            // Thực hiện một truy vấn đơn giản để kiểm tra và giữ kết nối database
            await this.dataSource.query('SELECT 1');
            return { status: 'ok', message: 'Backend and database are alive.' };
        } catch (error) {
            return { status: 'error', message: 'Database connection failed.' };
        }
    }
}