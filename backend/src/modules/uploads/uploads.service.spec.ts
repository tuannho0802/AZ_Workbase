import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Setting } from '../../database/entities/setting.entity';
import { User } from '../../database/entities/user.entity';

// ----------------------------------------------------------------------
// Mock AWS SDK - chỉ cần PutObjectCommand đi qua getSignedUrl() (presign),
// HeadObjectCommand/DeleteObjectCommand đi qua .send() thật.
// ----------------------------------------------------------------------
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'PutObjectCommand', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'GetObjectCommand', input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'DeleteObjectCommand', input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'HeadObjectCommand', input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { UploadsService } from './uploads.service';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockGetSignedUrl = getSignedUrl as jest.Mock;

describe('UploadsService', () => {
  let service: UploadsService;

  const mockSettingRepo = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((s: any) => Promise.resolve(s)),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
  };

  const validConfig: Record<string, string> = {
    B2_REGION: 'us-west-004',
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_ACCESS_KEY_ID: 'test-key-id',
    B2_SECRET_ACCESS_KEY: 'test-secret',
    B2_BUCKET_AVATARS: 'az-imgs-avatars-workbase',
    B2_BUCKET_LEAVE_ATTACHMENTS: 'az-imgs-leave-request-workbase',
  };

  const buildService = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: getRepositoryToken(Setting), useValue: mockSettingRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => validConfig[key]) } },
      ],
    }).compile();
    return module.get<UploadsService>(UploadsService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSettingRepo.find.mockResolvedValue([]);
    mockGetSignedUrl.mockImplementation((_client: any, command: any) =>
      Promise.resolve(`https://signed.example.com/${command?.input?.Key ?? 'unknown'}`),
    );
    service = await buildService();
  });

  describe('presignAvatarUpload - đặt tên file dễ đọc (thay UUID ngẫu nhiên)', () => {
    it('build key dạng "avatars/{userId}/{TenNhanVien}_{PhongBan}_{Role}.{ext}" khi user có đủ tên/phòng ban/role', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 12,
        name: 'Nguyễn Văn A',
        role: 'admin',
        department: { name: 'Phòng Hỗ trợ Kỹ thuật' },
      });

      const result = await service.presignAvatarUpload(12, 'image/png');

      expect(result.key).toBe('avatars/12/NguyenVanA_PhongHoTroKyThuat_Admin.png');
      expect(result.uploadUrl).toBe(`https://signed.example.com/${result.key}`);
    });

    it('bỏ qua phần thiếu (không để dấu "_" thừa) khi user chưa có phòng ban', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 20,
        name: 'Tran Thi B',
        role: 'employee',
        department: null,
      });

      const result = await service.presignAvatarUpload(20, 'image/webp');

      expect(result.key).toBe('avatars/20/TranThiB_Employee.webp');
    });

    it('vẫn đặt tên KEY THEO NAMESPACE userId - 2 người trùng tên/phòng ban/role tuyệt đối không đụng key nhau', async () => {
      mockUserRepo.findOne
        .mockResolvedValueOnce({ id: 1, name: 'Vo Van C', role: 'employee', department: { name: 'Sales' } })
        .mockResolvedValueOnce({ id: 2, name: 'Vo Van C', role: 'employee', department: { name: 'Sales' } });

      const result1 = await service.presignAvatarUpload(1, 'image/png');
      const result2 = await service.presignAvatarUpload(2, 'image/png');

      expect(result1.key).toBe('avatars/1/VoVanC_Sales_Employee.png');
      expect(result2.key).toBe('avatars/2/VoVanC_Sales_Employee.png');
      expect(result1.key).not.toBe(result2.key);
    });

    it('KHÔNG throw nếu không tìm thấy user (dữ liệu hỏng hiếm gặp) - fallback về "File.{ext}", không chặn luồng upload', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.presignAvatarUpload(999, 'image/jpeg');

      expect(result.key).toBe('avatars/999/File.jpeg');
    });

    it('vẫn ném BadRequestException nếu contentType không hợp lệ, KHÔNG gọi tới userRepository', async () => {
      await expect(service.presignAvatarUpload(1, 'application/pdf')).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('presignAttachmentUpload - vẫn giữ UUID ngẫu nhiên (không đổi theo yêu cầu)', () => {
    it('build key dạng "leave-attachments/{userId}/{uuid}.{ext}"', async () => {
      const result = await service.presignAttachmentUpload(7, 'image/png');

      expect(result.key).toMatch(/^leave-attachments\/7\/[0-9a-f-]{36}\.png$/);
    });
  });

  describe('assertUploadedSizeWithinLimit', () => {
    it('không throw nếu dung lượng object trong giới hạn', async () => {
      mockSend.mockResolvedValueOnce({ ContentLength: 500 * 1024 });

      await expect(
        service.assertUploadedSizeWithinLimit('az-imgs-avatars-workbase', 'avatars/1/A.png', 1024),
      ).resolves.toBeUndefined();
    });

    it('throw BadRequestException + tự xoá object nếu vượt giới hạn', async () => {
      mockSend
        .mockResolvedValueOnce({ ContentLength: 5000 * 1024 }) // HeadObjectCommand
        .mockResolvedValueOnce({}); // DeleteObjectCommand (dọn object quá khổ)

      await expect(
        service.assertUploadedSizeWithinLimit('az-imgs-avatars-workbase', 'avatars/1/A.png', 1024),
      ).rejects.toThrow(BadRequestException);

      expect(mockSend).toHaveBeenCalledTimes(2);
      const deleteCommand = mockSend.mock.calls[1][0];
      expect(deleteCommand.commandName).toBe('DeleteObjectCommand');
    });
  });
});
