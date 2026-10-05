import { describe, expect, it } from 'vitest';
import { DEMO_CUSTOMERS } from './sample-customers';
import { DEMO_PEOPLE } from './personas';
import { canAssignCustomer, computeAssignedList, computeShareablePool, previewAssignOutcome, previewReclaim, type AssignCaller } from './compute-assign';

const P = DEMO_PEOPLE;
const all: AssignCaller = { userId: P.admin.id, scope: 'all', managedDepartmentIds: [] };
const dept: AssignCaller = { userId: P.manager.id, scope: 'department', managedDepartmentIds: [1] };
const own = (userId: number): AssignCaller => ({ userId, scope: 'own', managedDepartmentIds: [] });

const chiaDuoc = (c: AssignCaller) => DEMO_CUSTOMERS.filter((x) => canAssignCustomer(x, c)).map((x) => x.id);
const pool = (c: AssignCaller) => computeShareablePool(DEMO_CUSTOMERS, c).map((x) => x.id);

describe('canAssignCustomer (đối chiếu CustomersService.bulkAssign)', () => {
  it('scope all: chia được mọi khách', () => {
    expect(chiaDuoc(all)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('scope department: chỉ khách thuộc phòng ban mình QUẢN LÝ (không cộng khách riêng)', () => {
    expect(chiaDuoc(dept)).toEqual([1, 3]);
  });
  it('scope own: khách mình là Sales chính, hoặc mình tạo mà chưa ai nhận', () => {
    expect(chiaDuoc(own(P.salesA.id))).toEqual([1]);
    expect(chiaDuoc(own(P.marketingM.id))).toEqual([2]); // tạo KH 2 chưa ai nhận
    expect(chiaDuoc(own(P.contentC.id))).toEqual([4]);
  });
  it('scope own: Sales PHỤ (chỉ được chia) không chia lại được', () => {
    // Bình là Sales phụ của KH 1, nhưng là Sales chính của KH 3 -> chỉ chia được KH 3
    expect(chiaDuoc(own(P.salesB.id))).toEqual([3]);
  });
  it('scope own: tạo ra nhưng đã có người nhận thì KHÔNG giật lại được', () => {
    const c = { ...DEMO_CUSTOMERS[0], createdById: P.salesB.id };
    expect(canAssignCustomer(c, own(P.salesB.id))).toBe(false);
  });
});

describe('computeShareablePool (đối chiếu getUnassigned - tab "Có thể chia")', () => {
  it('Admin: toàn bộ khách chưa gán + khách mình là Sales chính', () => {
    expect(pool(all)).toEqual([2, 4, 6]);
  });
  it('Manager (department): khách chưa gán thuộc phòng ban mình quản lý', () => {
    expect(pool(dept)).toEqual([]); // phòng ban 1 không còn khách chưa gán
  });
  it('Employee: khách chưa gán mình tạo + khách mình là Sales chính', () => {
    expect(pool(own(P.salesA.id))).toEqual([1]);
    expect(pool(own(P.marketingM.id))).toEqual([2]);
  });
});

describe('computeAssignedList (tab "Đã assign")', () => {
  it('chỉ giữ khách đã có Sales chính', () => {
    expect(computeAssignedList(DEMO_CUSTOMERS).map((c) => c.id)).toEqual([1, 3, 5]);
  });
});

describe('previewAssignOutcome (bulkAssign: Sales chính / Sales phụ)', () => {
  const [an, binh, dung] = [P.salesA, P.salesB, P.salesD];
  it('khách chưa có Sales chính: người ĐẦU TIÊN thành Sales chính, còn lại Sales phụ', () => {
    const out = previewAssignOutcome(DEMO_CUSTOMERS[1], [binh, an]);
    expect(out.primary).toEqual(binh);
    expect(out.shared).toEqual([an]);
  });
  it('khách đã có Sales chính: giữ nguyên, người mới là Sales phụ', () => {
    const out = previewAssignOutcome(DEMO_CUSTOMERS[2], [dung]);
    expect(out.primary).toEqual(P.salesB);
    expect(out.shared).toEqual([dung]);
  });
  it('người đã có lượt gán active không bị nhân đôi', () => {
    const out = previewAssignOutcome(DEMO_CUSTOMERS[0], [binh]);
    expect(out.primary).toEqual(an);
    expect(out.shared.map((s) => s.id)).toEqual([binh.id]);
  });
});

describe('previewReclaim (reclaimAssignment)', () => {
  it('thu hồi Sales chính: người gán sớm nhất còn lại lên thay; hết người thì về chưa gán', () => {
    expect(previewReclaim(4, 4, [P.salesB])).toEqual(P.salesB);
    expect(previewReclaim(4, 4, [])).toBeNull();
  });
  it('thu hồi Sales phụ: Sales chính không đổi', () => {
    expect(previewReclaim(4, 5, [P.salesA])).toBe('unchanged');
  });
});
