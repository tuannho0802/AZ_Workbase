import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MediaSourcesService } from './media-sources.service';
import { MediaSource } from '../../database/entities/media-source.entity';
import { Customer } from '../../database/entities/customer.entity';

describe('MediaSourcesService', () => {
    let service: MediaSourcesService;

    const mockMediaSourceRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
    };
    const mockCustomerRepo = {
        count: jest.fn(),
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MediaSourcesService,
                { provide: getRepositoryToken(MediaSource), useValue: mockMediaSourceRepo },
                { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
            ],
        }).compile();

        service = module.get<MediaSourcesService>(MediaSourcesService);
    });

    describe('findAll', () => {
        it('activeOnly=false -> lấy TẤT CẢ nguồn (kể cả đã khoá), sắp theo sortOrder', async () => {
            mockMediaSourceRepo.find.mockResolvedValue([{ id: 1, name: 'Facebook' }]);

            const result = await service.findAll(false);

            expect(mockMediaSourceRepo.find).toHaveBeenCalledWith({
                where: {},
                order: { sortOrder: 'ASC', id: 'ASC' },
            });
            expect(result).toEqual([{ id: 1, name: 'Facebook' }]);
        });

        it('activeOnly=true -> chỉ lấy nguồn CHƯA khoá (isLocked: false)', async () => {
            mockMediaSourceRepo.find.mockResolvedValue([]);

            await service.findAll(true);

            expect(mockMediaSourceRepo.find).toHaveBeenCalledWith({
                where: { isLocked: false },
                order: { sortOrder: 'ASC', id: 'ASC' },
            });
        });
    });

    describe('create', () => {
        it('tạo nguồn mới thành công khi tên chưa tồn tại', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue(null);
            mockMediaSourceRepo.create.mockReturnValue({ name: 'Zalo', color: '#1677ff', sortOrder: 0 });
            mockMediaSourceRepo.save.mockResolvedValue({ id: 7, name: 'Zalo', color: '#1677ff', sortOrder: 0 });

            const result = await service.create({ name: 'Zalo' });

            expect(mockMediaSourceRepo.create).toHaveBeenCalledWith({ name: 'Zalo', color: '#1677ff', sortOrder: 0 });
            expect(result).toEqual({ id: 7, name: 'Zalo', color: '#1677ff', sortOrder: 0 });
        });

        it('cho phép truyền màu tuỳ chỉnh khi tạo', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue(null);
            mockMediaSourceRepo.create.mockReturnValue({ name: 'Zalo', color: '#0068FF', sortOrder: 0 });
            mockMediaSourceRepo.save.mockResolvedValue({ id: 7, name: 'Zalo', color: '#0068FF', sortOrder: 0 });

            await service.create({ name: 'Zalo', color: '#0068FF' });

            expect(mockMediaSourceRepo.create).toHaveBeenCalledWith({ name: 'Zalo', color: '#0068FF', sortOrder: 0 });
        });

        it('ném ConflictException nếu tên nguồn đã tồn tại', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue({ id: 1, name: 'Facebook' });

            await expect(service.create({ name: 'Facebook' })).rejects.toThrow(ConflictException);
            expect(mockMediaSourceRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('ném NotFoundException nếu nguồn không tồn tại', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue(null);

            await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
        });

        it('ném ConflictException nếu đổi tên trùng với nguồn khác đã có', async () => {
            mockMediaSourceRepo.findOne
                .mockResolvedValueOnce({ id: 1, name: 'Facebook' }) // tìm nguồn cần sửa
                .mockResolvedValueOnce({ id: 2, name: 'TikTok' }); // tìm trùng tên mới

            await expect(service.update(1, { name: 'TikTok' })).rejects.toThrow(ConflictException);
        });

        it('cho phép đổi sortOrder mà không cần đổi tên', async () => {
            const source = { id: 1, name: 'Facebook', color: '#1877F2', sortOrder: 0 };
            mockMediaSourceRepo.findOne.mockResolvedValue(source);
            mockMediaSourceRepo.save.mockImplementation((s) => Promise.resolve(s));

            const result = await service.update(1, { sortOrder: 5 });

            expect(result.sortOrder).toBe(5);
            expect(result.name).toBe('Facebook');
        });

        it('cho phép đổi màu mà không cần đổi tên', async () => {
            const source = { id: 1, name: 'Facebook', color: '#1877F2', sortOrder: 0 };
            mockMediaSourceRepo.findOne.mockResolvedValue(source);
            mockMediaSourceRepo.save.mockImplementation((s) => Promise.resolve(s));

            const result = await service.update(1, { color: '#0068FF' });

            expect(result.color).toBe('#0068FF');
            expect(result.name).toBe('Facebook');
        });
    });

    describe('setLocked', () => {
        it('khoá nguồn thành công', async () => {
            const source = { id: 1, name: 'Facebook', isLocked: false };
            mockMediaSourceRepo.findOne.mockResolvedValue(source);
            mockMediaSourceRepo.save.mockImplementation((s) => Promise.resolve(s));

            const result = await service.setLocked(1, true);

            expect(result.isLocked).toBe(true);
        });

        it('ném NotFoundException nếu id không tồn tại', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue(null);

            await expect(service.setLocked(999, true)).rejects.toThrow(NotFoundException);
        });
    });

    describe('remove', () => {
        it('xoá thành công khi KHÔNG có customer nào đang dùng nguồn này', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
            mockCustomerRepo.count.mockResolvedValue(0);

            const result = await service.remove(1);

            expect(mockCustomerRepo.count).toHaveBeenCalledWith({ where: { source: 'Zalo' } });
            expect(mockMediaSourceRepo.remove).toHaveBeenCalled();
            expect(result).toEqual({ deleted: true });
        });

        it('ném BadRequestException nếu đang có customer dùng nguồn này (gợi ý dùng Khoá thay vì Xoá)', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue({ id: 1, name: 'Facebook' });
            mockCustomerRepo.count.mockResolvedValue(42);

            await expect(service.remove(1)).rejects.toThrow(BadRequestException);
            expect(mockMediaSourceRepo.remove).not.toHaveBeenCalled();
        });

        it('ném NotFoundException nếu id không tồn tại', async () => {
            mockMediaSourceRepo.findOne.mockResolvedValue(null);

            await expect(service.remove(999)).rejects.toThrow(NotFoundException);
        });
    });
});