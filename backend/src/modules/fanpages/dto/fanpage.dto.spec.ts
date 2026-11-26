import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateFanpageDto, FanpageQueryDto } from './fanpage.dto';

/** Patch 2: công tắc "Theo dõi" (`isActive`) đã bỏ -> FE cũ còn gửi sẽ bị 400 (forbidNonWhitelisted), cùng cấu hình main.ts. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe('Fanpage DTO sau khi bỏ isActive', () => {
    it('UpdateFanpageDto: isActive bị từ chối (400)', async () => {
        await expect(pipe.transform({ name: 'X', isActive: false }, { type: 'body', metatype: UpdateFanpageDto })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('FanpageQueryDto: ?isActive= bị từ chối (400)', async () => {
        await expect(pipe.transform({ isActive: 'true' }, { type: 'query', metatype: FanpageQueryDto })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('UpdateFanpageDto: tình trạng vẫn nhận bình thường', async () => {
        await expect(pipe.transform({ healthStatusId: 6 }, { type: 'body', metatype: UpdateFanpageDto })).resolves.toMatchObject({ healthStatusId: 6 });
    });
});
