import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets } from 'typeorm';
import { LeaveRequest, LeaveStatus } from '../../database/entities/leave-request.entity';
import { User } from '../../database/entities/user.entity';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsStatsService } from './leave-requests-stats.service';

describe('LeaveRequestsStatsService', () => {
  let service: LeaveRequestsStatsService;

  const qbMock = (result: any[]) => {
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return qb;
  };
  const leaveRepo = { createQueryBuilder: jest.fn() };
  const userRepo = { createQueryBuilder: jest.fn() };
  const leaveSvc = {
    hasApproverScope: jest.fn(),
    applyApproverScope: jest.fn().mockResolvedValue(undefined),
    applyApproverScopeToUsers: jest.fn().mockResolvedValue(undefined),
  };

  const leave = (o: any) => ({
    id: 1,
    requesterId: 1,
    leaveType: 'annual',
    status: LeaveStatus.APPROVED,
    startDate: '2026-09-10',
    endDate: '2026-09-10',
    totalDays: '1.0', // TypeORM decimal có thể về dạng string nếu thiếu transformer -> service phải Number()
    isSupplementary: false,
    requester: { id: 1, name: 'An', departmentId: 1, department: { id: 1, name: 'Sales' } },
    ...o,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    leaveSvc.hasApproverScope.mockReturnValue(true);
    const mod = await Test.createTestingModule({
      providers: [
        LeaveRequestsStatsService,
        { provide: getRepositoryToken(LeaveRequest), useValue: leaveRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: LeaveRequestsService, useValue: leaveSvc },
      ],
    }).compile();
    service = mod.get(LeaveRequestsStatsService);
  });

  const query = { period: 'month' as const, anchor: '2026-09-15' };

  it('không có phạm vi xem -> trả 0 và KHÔNG query DB', async () => {
    leaveSvc.hasApproverScope.mockReturnValue(false);
    const r = await service.getStats(query, 5, 'employee', null);
    expect(r.headcount).toBe(0);
    expect(r.summary.requests).toBe(0);
    expect(r.period).toMatchObject({ from: '2026-09-01 00:00:00', granularity: 'day' });
    expect(leaveRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('áp scope cho CẢ đơn (2 kỳ) lẫn quân số, dùng đúng viewer/role/scope', async () => {
    leaveRepo.createQueryBuilder.mockImplementation(() => qbMock([]));
    userRepo.createQueryBuilder.mockImplementation(() => qbMock([]));
    await service.getStats(query, 7, 'manager', 'department');
    expect(leaveSvc.applyApproverScope).toHaveBeenCalledTimes(2); // kỳ này + kỳ trước
    expect(leaveSvc.applyApproverScope).toHaveBeenCalledWith(expect.anything(), 7, 'manager', 'department');
    expect(leaveSvc.applyApproverScopeToUsers).toHaveBeenCalledWith(expect.anything(), 7, 'manager', 'department');
  });

  it('loại đơn Thùng rác (chỉ pending/approved/rejected) + lọc giao khoảng ngày', async () => {
    const qb = qbMock([]);
    leaveRepo.createQueryBuilder.mockReturnValue(qb);
    userRepo.createQueryBuilder.mockReturnValue(qbMock([]));
    await service.getStats(query, 1, 'admin', null);
    const [, p] = qb.where.mock.calls[0];
    expect(p.statuses).toEqual([LeaveStatus.PENDING, LeaveStatus.APPROVED, LeaveStatus.REJECTED]);
    expect(qb.andWhere).toHaveBeenCalledWith('leave.startDate <= :statsTo', { statsTo: '2026-09-30' });
    expect(qb.andWhere).toHaveBeenCalledWith('leave.endDate >= :statsFrom', { statsFrom: '2026-09-01' });
  });

  it('quân số chỉ tính tài khoản đang hoạt động (truyền số 1, không phải boolean) + đã được duyệt', async () => {
    const uqb = qbMock([]);
    leaveRepo.createQueryBuilder.mockImplementation(() => qbMock([]));
    userRepo.createQueryBuilder.mockReturnValue(uqb);
    await service.getStats(query, 1, 'admin', null);
    expect(uqb.where).toHaveBeenCalledWith('user.isActive = :statsActive', { statsActive: 1 });
    expect(uqb.andWhere).toHaveBeenCalledWith('user.approvalStatus = :statsApproved', { statsApproved: 'approved' });
  });

  it('bộ lọc phòng ban/loại phép/nhân viên áp lên cả đơn và quân số', async () => {
    const lqb = qbMock([]);
    const uqb = qbMock([]);
    leaveRepo.createQueryBuilder.mockReturnValue(lqb);
    userRepo.createQueryBuilder.mockReturnValue(uqb);
    await service.getStats({ ...query, departmentId: 3, leaveType: 'sick', requesterId: 9 }, 1, 'admin', null);
    expect(lqb.andWhere).toHaveBeenCalledWith('requester.departmentId = :statsDeptId', { statsDeptId: 3 });
    expect(lqb.andWhere).toHaveBeenCalledWith('leave.leaveType = :statsLeaveType', { statsLeaveType: 'sick' });
    expect(lqb.andWhere).toHaveBeenCalledWith('leave.requesterId = :statsRequesterId', { statsRequesterId: 9 });
    expect(uqb.andWhere).toHaveBeenCalledWith('user.departmentId = :statsDeptId', { statsDeptId: 3 });
    expect(uqb.andWhere).toHaveBeenCalledWith('user.id = :statsRequesterId', { statsRequesterId: 9 });
  });

  it('map entity -> số liệu: totalDays dạng string vẫn cộng đúng, so sánh kỳ trước', async () => {
    let call = 0;
    leaveRepo.createQueryBuilder.mockImplementation(() => {
      call++;
      // getStats gọi loadRows kỳ này rồi kỳ trước (Promise.all giữ thứ tự gọi)
      return qbMock(call === 1 ? [leave({ id: 1, totalDays: '2.5' }), leave({ id: 2, requesterId: 2, requester: { id: 2, name: 'Bình', departmentId: 1, department: { id: 1, name: 'Sales' } }, status: LeaveStatus.REJECTED })] : [leave({ id: 3 })]);
    });
    userRepo.createQueryBuilder.mockReturnValue(
      qbMock([
        { id: 1, departmentId: 1, department: { name: 'Sales' } },
        { id: 2, departmentId: 1, department: { name: 'Sales' } },
        { id: 3, departmentId: null, department: null },
      ]),
    );
    const r = await service.getStats(query, 1, 'admin', null);
    expect(r.headcount).toBe(3);
    expect(r.summary).toMatchObject({ requests: 2, approvedDays: 2.5, approved: 1, rejected: 1, approvalRate: 50, participationRate: 66.7 });
    expect(r.previousSummary).toMatchObject({ requests: 1, approvedDays: 1 });
    expect(r.previousPeriod.to.startsWith('2026-08-31')).toBe(true);
    expect(r.byDepartment.map((d) => d.departmentName).sort()).toEqual(['Chưa có phòng ban', 'Sales']);
  });
  describe('getRequests (Mini Table drill-down)', () => {
    const entityQb = (result: any[]) => {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(result),
      };
      return qb;
    };

    it('không có phạm vi xem -> rỗng và KHÔNG query DB', async () => {
      leaveSvc.hasApproverScope.mockReturnValue(false);
      const r = await service.getRequests({ ...query, page: 1, limit: 10 }, 5, 'employee', null);
      expect(r).toMatchObject({ data: [], total: 0, totalPages: 0 });
      expect(leaveRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lọc drill trên đúng tập đơn của getStats, sắp xếp ngày nghỉ mới nhất, giữ thứ tự khi nạp entity', async () => {
      const rows = [
        leave({ id: 1, requesterId: 1, startDate: '2026-09-03', endDate: '2026-09-03' }),
        leave({ id: 2, requesterId: 2, status: LeaveStatus.PENDING, startDate: '2026-09-20', endDate: '2026-09-20', requester: { id: 2, name: 'Bình', departmentId: 1, department: { id: 1, name: 'Sales' } } }),
        leave({ id: 3, requesterId: 2, startDate: '2026-09-10', endDate: '2026-09-10', totalDays: '2.0', requester: { id: 2, name: 'Bình', departmentId: 1, department: { id: 1, name: 'Sales' } } }),
      ];
      const idsQb = qbMock(rows);
      const entQb = entityQb([{ id: 3 }, { id: 2 }]);
      leaveRepo.createQueryBuilder.mockReturnValueOnce(idsQb).mockReturnValueOnce(entQb);

      const r = await service.getRequests({ ...query, requesterIds: '2', page: 1, limit: 10 }, 7, 'manager', 'department');

      expect(leaveSvc.applyApproverScope).toHaveBeenCalledWith(idsQb, 7, 'manager', 'department');
      expect(r.total).toBe(2);
      expect(r.totalDays).toBe(3); // 1 (pending, mặc định 1.0) + 2.0 - tính mọi trạng thái
      expect(entQb.whereInIds).toHaveBeenCalledWith([2, 3]); // 2026-09-20 trước 2026-09-10
      expect(r.data.map((d) => d.id)).toEqual([2, 3]);
    });

    it('phân trang: chỉ nạp entity của trang được yêu cầu', async () => {
      const rows = [1, 2, 3].map((id) => leave({ id, startDate: `2026-09-0${id}`, endDate: `2026-09-0${id}` }));
      leaveRepo.createQueryBuilder.mockReturnValueOnce(qbMock(rows)).mockReturnValueOnce(entityQb([{ id: 1 }]));
      const r = await service.getRequests({ ...query, page: 2, limit: 2 }, 1, 'admin', null);
      expect(r).toMatchObject({ total: 3, totalPages: 2, page: 2 });
      expect(r.data.map((d) => d.id)).toEqual([1]);
    });
  });
});
