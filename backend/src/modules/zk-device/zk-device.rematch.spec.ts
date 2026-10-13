import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ZkDeviceService } from './zk-device.service';
import { User } from '../../database/entities/user.entity';
import { AttendanceLog } from '../../database/entities/attendance-log.entity';
import { ZkDeviceUserCache } from '../../database/entities/zk-device-user-cache.entity';
import { Department } from '../../database/entities/department.entity';
import { AuditService } from '../audit/audit.service';

jest.mock('../../integrations/zk-device/sequential-attendance-reader.util', () => ({
  readAttendanceLogsSequential: jest.fn().mockResolvedValue([]),
}));

/**
 * Plan CPU 13G: rematchUnmatchedLogsCore gộp "1 SELECT user + N UPDATE" thành
 * ĐÚNG 1 câu UPDATE ... JOIN. Spec ở mức mock câu SQL/kết quả (không cần DB
 * thật) - ngữ nghĩa trùng mã máy / xoá mềm được bảo đảm bởi nội dung câu SQL.
 */
describe('ZkDeviceService.rematchUnmatchedLogsCore (13G)', () => {
  let service: ZkDeviceService;
  const mockAttendanceLogRepo = { query: jest.fn(), createQueryBuilder: jest.fn() };
  const mockUserRepo = { find: jest.fn() };
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZkDeviceService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(AttendanceLog), useValue: mockAttendanceLogRepo },
        { provide: getRepositoryToken(ZkDeviceUserCache), useValue: {} },
        { provide: getRepositoryToken(Department), useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditService, useValue: { logAction: jest.fn(), logActionAsync: jest.fn() } },
      ],
    }).compile();
    service = module.get(ZkDeviceService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  const core = () => (service as any).rematchUnmatchedLogsCore() as Promise<number>;

  it('chạy ĐÚNG 1 câu UPDATE, không còn SELECT user / N UPDATE bằng QueryBuilder', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue({ affectedRows: 5 });
    await core();
    expect(mockAttendanceLogRepo.query).toHaveBeenCalledTimes(1);
    expect(mockUserRepo.find).not.toHaveBeenCalled();
    expect(mockAttendanceLogRepo.createQueryBuilder).not.toHaveBeenCalled();
    // Không nối chuỗi dữ liệu người dùng: câu SQL không có tham số.
    expect(mockAttendanceLogRepo.query.mock.calls[0]).toHaveLength(1);
  });

  it('câu SQL giữ đúng ngữ nghĩa vòng lặp cũ (MIN(id)/mã máy, bỏ xoá mềm, chỉ dòng NULL, COLLATE tường minh)', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue({ affectedRows: 0 });
    await core();
    const sql: string = mockAttendanceLogRepo.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toMatch(/^UPDATE attendance_logs al INNER JOIN \(/);
    expect(sql).toContain('SELECT zk_device_user_id, MIN(id) AS id FROM users');
    expect(sql).toContain('WHERE zk_device_user_id IS NOT NULL AND deleted_at IS NULL');
    expect(sql).toContain('GROUP BY zk_device_user_id');
    expect(sql).toContain('al.device_user_id = u.zk_device_user_id COLLATE utf8mb4_unicode_ci');
    expect(sql).toContain('SET al.matched_user_id = u.id');
    expect(sql).toContain('WHERE al.matched_user_id IS NULL');
  });

  it('trả về tổng số dòng được gán (affectedRows) và ghi log [Rematch] khi > 0', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue({ affectedRows: 7 });
    await expect(core()).resolves.toBe(7);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Rematch] Đã khớp lại 7 log'));
  });

  it('không có user nào được map / không dòng nào đổi -> trả 0 và KHÔNG ghi log', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue({ affectedRows: 0 });
    await expect(core()).resolves.toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('kết quả raw thiếu affectedRows -> coi như 0 (không throw)', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue(undefined);
    await expect(core()).resolves.toBe(0);
  });

  it('lỗi DB được ném nguyên vẹn (mapUser/syncNow tự xử lý như cũ)', async () => {
    mockAttendanceLogRepo.query.mockRejectedValue(new Error('Illegal mix of collations'));
    await expect(core()).rejects.toThrow('Illegal mix of collations');
  });

  it('rematchUnmatchedLogs(callerId) vẫn ghi audit với số affected từ Core', async () => {
    mockAttendanceLogRepo.query.mockResolvedValue({ affectedRows: 3 });
    const audit = (service as any).auditService.logActionAsync as jest.Mock;
    await expect(service.rematchUnmatchedLogs(9)).resolves.toBe(3);
    expect(audit).toHaveBeenCalledWith(9, 'REMATCH_ATTENDANCE_LOGS', 'attendance_log', 0, null, { updated: 3 });
  });
});
