import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { AuditService } from '../audit/audit.service';
import {
  STORAGE_USAGE_CACHE_SETTING_KEY,
  STORAGE_SOFT_LIMIT_SETTING_KEY,
  DEFAULT_STORAGE_SOFT_LIMIT_GB,
} from './storage.constants';

// ----------------------------------------------------------------------
// Mock AWS SDK: CHỈ S3Client.send() (ListObjectsV2Command/DeleteObjectCommand)
// được gọi thật trong service. PutObjectCommand/GetObjectCommand KHÔNG bao
// giờ đi qua .send() - chúng được đưa thẳng vào getSignedUrl() (xem
// storage.service.ts: listMedia dùng GetObjectCommand, presignMediaLibraryUpload
// dùng PutObjectCommand) nên không cần giả lập hành vi .send() riêng cho 2
// command này, chỉ cần factory tạo object { commandName, input } để assert.
// ----------------------------------------------------------------------
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ commandName: 'ListObjectsV2Command', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'DeleteObjectCommand', input })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'PutObjectCommand', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'GetObjectCommand', input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { StorageService } from './storage.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockGetSignedUrl = getSignedUrl as jest.Mock;

describe('StorageService', () => {
  let service: StorageService;

  const mockSettingRepo = {
    findOne: jest.fn(),
    save: jest.fn((s: any) => Promise.resolve(s)),
  };

  // ⚠️ StorageService giờ có thêm UserRepository + LeaveRequestAttachmentRepository
  // (xem storage.service.ts constructor) - dùng để dọn tham chiếu DB trước khi xoá
  // object thật khi xoá bucket avatars/leave-attachments.
  const mockUserRepo = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const mockAttachmentRepo = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const mockAuditService = {
    logAction: jest.fn(),
    logActionAsync: jest.fn(),
  };

  // Đủ cả 3 biến B2_BUCKET_* - test riêng "thiếu biến môi trường" sẽ build
  // 1 module khác (thiếu 1 key), KHÔNG dùng chung config này.
  const validConfig: Record<string, string> = {
    B2_REGION: 'us-west-004',
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_ACCESS_KEY_ID: 'test-key-id',
    B2_SECRET_ACCESS_KEY: 'test-secret',
    B2_BUCKET_AVATARS: 'az-imgs-avatars-workbase',
    B2_BUCKET_LEAVE_ATTACHMENTS: 'az-imgs-leave-request-workbase',
    B2_BUCKET_MEDIA_LIBRARY: 'az-imgs-media-library-workbase',
  };

  const buildService = async (config: Record<string, string | undefined> = validConfig) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: getRepositoryToken(Setting), useValue: mockSettingRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(LeaveRequestAttachment), useValue: mockAttachmentRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile();
    return module.get<StorageService>(StorageService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetSignedUrl.mockImplementation((_client: any, command: any) =>
      Promise.resolve(`https://signed.example.com/${command?.input?.Key ?? 'unknown'}`),
    );
    mockUserRepo.update.mockResolvedValue({ affected: 1 });
    mockAttachmentRepo.delete.mockResolvedValue({ affected: 1 });
    mockUserRepo.find.mockResolvedValue([]);
    mockAttachmentRepo.find.mockResolvedValue([]);
    service = await buildService();
  });

  // ----------------------------------------------------------------------
  describe('cấu hình bucket (resolveBucketName)', () => {
    it('ném BadRequestException nếu thiếu biến môi trường bucket (vd quên B2_BUCKET_MEDIA_LIBRARY)', async () => {
      const { B2_BUCKET_MEDIA_LIBRARY, ...missingConfig } = validConfig;
      const brokenService = await buildService(missingConfig);

      await expect(brokenService.presignMediaLibraryUpload('image/png')).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------------
  describe('listMedia', () => {
    it('trả về items kèm viewUrl đã ký + nextCursor null khi không còn trang tiếp', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'avatars/a.jpg', Size: 1024, LastModified: new Date('2026-09-01T00:00:00Z') }],
        IsTruncated: false,
      });

      const result = await service.listMedia('avatars', undefined, 50);

      expect(result.items).toEqual([
        {
          key: 'avatars/a.jpg',
          size: 1024,
          lastModified: '2026-09-01T00:00:00.000Z',
          viewUrl: 'https://signed.example.com/avatars/a.jpg',
        },
      ]);
      expect(result.nextCursor).toBeNull();
      expect(result.bucket).toBe('avatars');
    });

    it('trả về nextCursor khi B2 báo IsTruncated = true (còn trang tiếp theo)', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [],
        IsTruncated: true,
        NextContinuationToken: 'token-abc',
      });

      const result = await service.listMedia('media-library', undefined, 50);

      expect(result.nextCursor).toBe('token-abc');
    });

    it('mutable=true CHỈ cho bucket media-library, false cho 2 bucket cũ (avatars/leave-attachments)', async () => {
      mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });

      expect((await service.listMedia('media-library', undefined, 50)).mutable).toBe(true);
      expect((await service.listMedia('avatars', undefined, 50)).mutable).toBe(false);
      expect((await service.listMedia('leave-attachments', undefined, 50)).mutable).toBe(false);
    });

    it('truyền đúng ContinuationToken (cursor) và MaxKeys (limit) xuống B2', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

      await service.listMedia('media-library', 'cursor-xyz', 25);

      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.input).toMatchObject({
        Bucket: 'az-imgs-media-library-workbase',
        MaxKeys: 25,
        ContinuationToken: 'cursor-xyz',
      });
    });
  });

  // ----------------------------------------------------------------------
  describe('presignMediaLibraryUpload', () => {
    it('ném BadRequestException nếu contentType không thuộc danh sách ảnh cho phép (JPEG/PNG/WEBP)', async () => {
      await expect(service.presignMediaLibraryUpload('application/pdf')).rejects.toThrow(BadRequestException);
    });

    it('trả về uploadUrl + key dạng media-library/{uuid}.{ext} với contentType hợp lệ', async () => {
      const result = await service.presignMediaLibraryUpload('image/webp');

      expect(result.key).toMatch(/^media-library\/[0-9a-f-]{36}\.webp$/);
      expect(result.uploadUrl).toBe(`https://signed.example.com/${result.key}`);
    });
  });

  // ----------------------------------------------------------------------
  describe('deleteMedia', () => {
    it('gọi DeleteObjectCommand thật với bucket media-library (không đụng DB - không có tham chiếu nào)', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('media-library', 'media-library/abc.webp');

      expect(mockUserRepo.update).not.toHaveBeenCalled();
      expect(mockAttachmentRepo.delete).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.commandName).toBe('DeleteObjectCommand');
      expect(sentCommand.input).toMatchObject({
        Bucket: 'az-imgs-media-library-workbase',
        Key: 'media-library/abc.webp',
      });
    });

    it('bucket "avatars": dọn users.avatar_url (set NULL) TRƯỚC khi xoá object thật trên B2', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('avatars', 'avatars/12/NguyenVanA_PhongKinhDoanh_Employee.webp');

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        { avatarUrl: 'avatars/12/NguyenVanA_PhongKinhDoanh_Employee.webp' },
        { avatarUrl: null },
      );
      expect(mockAttachmentRepo.delete).not.toHaveBeenCalled();
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.input).toMatchObject({
        Bucket: 'az-imgs-avatars-workbase',
        Key: 'avatars/12/NguyenVanA_PhongKinhDoanh_Employee.webp',
      });
      // Thứ tự bắt buộc: dọn DB xong mới gọi S3 - verify qua invocation order.
      expect(mockUserRepo.update.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
    });

    it('bucket "avatars": KHÔNG throw nếu không còn user nào tham chiếu key này (avatar mồ côi - vẫn xoá object bình thường)', async () => {
      mockUserRepo.update.mockResolvedValueOnce({ affected: 0 });
      mockSend.mockResolvedValueOnce({});

      await expect(service.deleteMedia('avatars', 'avatars/999/orphan.webp')).resolves.toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('bucket "leave-attachments": xoá row leave_request_attachments (theo object_key) TRƯỚC khi xoá object thật trên B2', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('leave-attachments', 'leave-attachments/7/giay-kham-benh.pdf');

      expect(mockAttachmentRepo.delete).toHaveBeenCalledWith({
        objectKey: 'leave-attachments/7/giay-kham-benh.pdf',
      });
      expect(mockUserRepo.update).not.toHaveBeenCalled();
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.input).toMatchObject({
        Bucket: 'az-imgs-leave-request-workbase',
        Key: 'leave-attachments/7/giay-kham-benh.pdf',
      });
      expect(mockAttachmentRepo.delete.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
    });

    it('ném NotFoundException (không lộ lỗi S3 thô ra ngoài) nếu B2 xoá thất bại', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(service.deleteMedia('media-library', 'khong-ton-tai.webp')).rejects.toThrow(NotFoundException);
    });
  });

  // ----------------------------------------------------------------------
  describe('bulkDeleteMedia', () => {
    it('xoá tuần tự nhiều key, trả về succeeded cho từng key thành công', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.bulkDeleteMedia('media-library', ['a.webp', 'b.webp', 'c.webp']);

      expect(result.succeeded).toEqual(['a.webp', 'b.webp', 'c.webp']);
      expect(result.failed).toEqual([]);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('1 key lỗi KHÔNG chặn các key còn lại - trả về đúng succeeded/failed riêng biệt', async () => {
      mockSend
        .mockResolvedValueOnce({}) // a.webp: ok
        .mockRejectedValueOnce(new Error('NoSuchKey')) // b.webp: lỗi
        .mockResolvedValueOnce({}); // c.webp: ok

      const result = await service.bulkDeleteMedia('media-library', ['a.webp', 'b.webp', 'c.webp']);

      expect(result.succeeded).toEqual(['a.webp', 'c.webp']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].key).toBe('b.webp');
      // Vẫn phải thử xoá c.webp dù b.webp lỗi trước đó - xử lý tuần tự không dừng giữa chừng.
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('bucket "avatars": dọn DB reference cho từng key trước khi xoá object tương ứng', async () => {
      mockSend.mockResolvedValue({});

      await service.bulkDeleteMedia('avatars', ['avatars/1/A.webp', 'avatars/2/B.webp']);

      expect(mockUserRepo.update).toHaveBeenCalledTimes(2);
      expect(mockUserRepo.update).toHaveBeenCalledWith({ avatarUrl: 'avatars/1/A.webp' }, { avatarUrl: null });
      expect(mockUserRepo.update).toHaveBeenCalledWith({ avatarUrl: 'avatars/2/B.webp' }, { avatarUrl: null });
    });
  });

  // ----------------------------------------------------------------------
  describe('getUsageFromCache', () => {
    it('trả về null nếu CHƯA từng refresh lần nào (chưa có row settings)', async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce(null);

      expect(await service.getUsageFromCache()).toBeNull();
    });

    it('parse đúng JSON cache khi đã có', async () => {
      const cache = {
        computedAt: '2026-09-09T00:00:00.000Z',
        buckets: { avatars: { usedBytes: 100, objectCount: 1 } },
        totalUsedBytes: 100,
      };
      mockSettingRepo.findOne.mockResolvedValueOnce({
        key: STORAGE_USAGE_CACHE_SETTING_KEY,
        value: JSON.stringify(cache),
      });

      expect(await service.getUsageFromCache()).toEqual(cache);
    });

    it('trả về null (KHÔNG throw) nếu JSON cache trong DB bị hỏng', async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce({
        key: STORAGE_USAGE_CACHE_SETTING_KEY,
        value: '{not-valid-json',
      });

      await expect(service.getUsageFromCache()).resolves.toBeNull();
    });
  });

  // ----------------------------------------------------------------------
  describe('getSoftLimitGb / updateSoftLimitGb', () => {
    it(`trả về DEFAULT_STORAGE_SOFT_LIMIT_GB (${DEFAULT_STORAGE_SOFT_LIMIT_GB}) nếu chưa có setting`, async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce(null);

      expect(await service.getSoftLimitGb()).toBe(DEFAULT_STORAGE_SOFT_LIMIT_GB);
    });

    it('trả về giá trị đã lưu trong settings nếu hợp lệ', async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce({ key: STORAGE_SOFT_LIMIT_SETTING_KEY, value: '80' });

      expect(await service.getSoftLimitGb()).toBe(80);
    });

    it('trả về default nếu value trong DB không phải số hợp lệ (dữ liệu hỏng)', async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce({ key: STORAGE_SOFT_LIMIT_SETTING_KEY, value: 'khong-phai-so' });

      expect(await service.getSoftLimitGb()).toBe(DEFAULT_STORAGE_SOFT_LIMIT_GB);
    });

    it('updateSoftLimitGb lưu đúng key STORAGE_SOFT_LIMIT_SETTING_KEY và trả lại giá trị vừa lưu', async () => {
      const result = await service.updateSoftLimitGb(120);

      expect(mockSettingRepo.save).toHaveBeenCalledWith({ key: STORAGE_SOFT_LIMIT_SETTING_KEY, value: '120' });
      expect(result).toBe(120);
    });
  });

  // ----------------------------------------------------------------------
  describe('refreshUsageCache', () => {
    it('cộng dồn usedBytes/objectCount qua NHIỀU trang phân trang cho 1 bucket', async () => {
      // avatars: 2 trang (giả lập bucket lớn hơn LIST_PAGE_SIZE)
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Size: 100 }, { Size: 200 }],
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        })
        .mockResolvedValueOnce({ Contents: [{ Size: 300 }], IsTruncated: false })
        // leave-attachments: rỗng
        .mockResolvedValueOnce({ Contents: [], IsTruncated: false })
        // media-library: rỗng
        .mockResolvedValueOnce({ Contents: [], IsTruncated: false });

      const result = await service.refreshUsageCache();

      expect(result.buckets.avatars).toEqual({ usedBytes: 600, objectCount: 3 });
      expect(result.totalUsedBytes).toBe(600);
    });

    it('tính đủ cả 3 bucket (avatars, leave-attachments, media-library) và cộng đúng vào totalUsedBytes', async () => {
      mockSend
        .mockResolvedValueOnce({ Contents: [{ Size: 10 }], IsTruncated: false }) // avatars
        .mockResolvedValueOnce({ Contents: [{ Size: 20 }], IsTruncated: false }) // leave-attachments
        .mockResolvedValueOnce({ Contents: [{ Size: 30 }], IsTruncated: false }); // media-library

      const result = await service.refreshUsageCache();

      expect(Object.keys(result.buckets)).toEqual(
        expect.arrayContaining(['avatars', 'leave-attachments', 'media-library']),
      );
      expect(result.totalUsedBytes).toBe(60);
    });

    it('lưu cache tính được vào settings với đúng key STORAGE_USAGE_CACHE_SETTING_KEY', async () => {
      mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });

      await service.refreshUsageCache();

      expect(mockSettingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: STORAGE_USAGE_CACHE_SETTING_KEY }),
      );
      const savedValue = mockSettingRepo.save.mock.calls[0][0].value;
      expect(() => JSON.parse(savedValue)).not.toThrow();
    });
  });

  // ----------------------------------------------------------------------
  // AUDIT LOG - xoá media KHÔNG phục hồi được nên phải chụp lại "file này
  // đang thuộc về ai" TRƯỚC khi dọn tham chiếu DB / xoá object thật.
  // ----------------------------------------------------------------------
  describe('audit log', () => {
    it('deleteMedia avatars: chụp user đang dùng avatar TRƯỚC khi update NULL, rồi ghi DELETE_STORAGE_MEDIA', async () => {
      mockUserRepo.find.mockResolvedValueOnce([{ id: 12, name: 'Nguyễn Văn A', email: 'a@az.vn' }]);
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('avatars', 'avatars/12/A.webp', 7);

      // snapshot phải được đọc TRƯỚC khi gỡ tham chiếu
      expect(mockUserRepo.find.mock.invocationCallOrder[0]).toBeLessThan(mockUserRepo.update.mock.invocationCallOrder[0]);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7, 'DELETE_STORAGE_MEDIA', 'storage_media', 0,
        {
          bucket: 'avatars',
          key: 'avatars/12/A.webp',
          clearedReferences: [{ type: 'user_avatar', userId: 12, name: 'Nguyễn Văn A', email: 'a@az.vn' }],
          viaBulk: false,
        },
        null,
      );
    });

    it('deleteMedia leave-attachments: chụp attachment/đơn nghỉ phép bị gỡ TRƯỚC khi delete row', async () => {
      mockAttachmentRepo.find.mockResolvedValueOnce([{ id: 3, leaveRequestId: 77, objectKey: 'leave-attachments/7/x.pdf' }]);
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('leave-attachments', 'leave-attachments/7/x.pdf', 7);

      expect(mockAttachmentRepo.find.mock.invocationCallOrder[0]).toBeLessThan(mockAttachmentRepo.delete.mock.invocationCallOrder[0]);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7, 'DELETE_STORAGE_MEDIA', 'storage_media', 0,
        expect.objectContaining({
          bucket: 'leave-attachments',
          clearedReferences: [{ type: 'leave_request_attachment', attachmentId: 3, leaveRequestId: 77 }],
        }),
        null,
      );
    });

    it('deleteMedia media-library (không có tham chiếu DB): vẫn ghi log với clearedReferences rỗng', async () => {
      mockSend.mockResolvedValueOnce({});

      await service.deleteMedia('media-library', 'media-library/a.webp', 7);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7, 'DELETE_STORAGE_MEDIA', 'storage_media', 0,
        { bucket: 'media-library', key: 'media-library/a.webp', clearedReferences: [], viaBulk: false },
        null,
      );
    });

    it('B2 xoá lỗi NHƯNG DB đã gỡ tham chiếu -> ghi DELETE_STORAGE_MEDIA_FAILED (không mất dấu thay đổi DB), vẫn ném NotFoundException', async () => {
      mockUserRepo.find.mockResolvedValueOnce([{ id: 12, name: 'A', email: 'a@az.vn' }]);
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(service.deleteMedia('avatars', 'avatars/12/A.webp', 7)).rejects.toThrow(NotFoundException);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledTimes(1);
      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7, 'DELETE_STORAGE_MEDIA_FAILED', 'storage_media', 0,
        expect.objectContaining({ bucket: 'avatars', key: 'avatars/12/A.webp' }),
        null,
      );
    });

    it('B2 xoá lỗi và KHÔNG có tham chiếu DB nào bị gỡ -> KHÔNG ghi log (không có gì thay đổi)', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));

      await expect(service.deleteMedia('media-library', 'x.webp', 7)).rejects.toThrow(NotFoundException);
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('không truyền callerId -> không ghi log', async () => {
      mockSend.mockResolvedValueOnce({});
      await service.deleteMedia('media-library', 'a.webp');
      expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
    });

    it('bulkDeleteMedia: mỗi key thành công có 1 dòng log riêng (viaBulk=true) + 1 dòng tổng kết BULK_DELETE_STORAGE_MEDIA (gồm cả key lỗi)', async () => {
      mockSend
        .mockResolvedValueOnce({}) // a ok
        .mockRejectedValueOnce(new Error('NoSuchKey')) // b lỗi
        .mockResolvedValueOnce({}); // c ok

      await service.bulkDeleteMedia('media-library', ['a.webp', 'b.webp', 'c.webp'], 7);

      const calls = mockAuditService.logActionAsync.mock.calls;
      const perFile = calls.filter((c) => c[1] === 'DELETE_STORAGE_MEDIA');
      expect(perFile).toHaveLength(2);
      expect(perFile.every((c) => c[4].viaBulk === true)).toBe(true);

      const summary = calls.find((c) => c[1] === 'BULK_DELETE_STORAGE_MEDIA');
      expect(summary).toBeDefined();
      expect(summary![4]).toEqual({
        bucket: 'media-library',
        requested: 3,
        succeeded: ['a.webp', 'c.webp'],
        failed: [{ key: 'b.webp', reason: 'Không tìm thấy hoặc không xoá được file này' }],
      });
    });

    it('updateSoftLimitGb -> UPDATE_STORAGE_LIMIT với old = hạn mức CŨ (đọc trước khi ghi đè)', async () => {
      mockSettingRepo.findOne.mockResolvedValueOnce({ key: STORAGE_SOFT_LIMIT_SETTING_KEY, value: '80' });

      await service.updateSoftLimitGb(120, 7);

      expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
        7, 'UPDATE_STORAGE_LIMIT', 'setting', 0,
        { key: STORAGE_SOFT_LIMIT_SETTING_KEY, softLimitGb: 80 },
        { key: STORAGE_SOFT_LIMIT_SETTING_KEY, softLimitGb: 120 },
      );
    });
  });
});
