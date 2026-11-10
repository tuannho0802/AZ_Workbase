import { FanpageAccessHelper, FanpageAccessContext } from './fanpage-access.helper';

const ctx = (over: Partial<FanpageAccessContext> = {}): FanpageAccessContext => ({
    userId: 10,
    ownerIds: [1],
    ownerDepartmentIds: [5],
    managedDepartmentIds: [],
    ...over,
});

describe('FanpageAccessHelper.allows', () => {
    it('scope null/none/undefined/lạ -> false kể cả là chủ', () => {
        for (const s of [null, undefined, 'none', 'xyz']) {
            expect(FanpageAccessHelper.allows(s, ctx({ userId: 1 }))).toBe(false);
        }
    });
    it('scope all -> true kể cả Page chưa có chủ', () => {
        expect(FanpageAccessHelper.allows('all', ctx({ ownerIds: [], ownerDepartmentIds: [] }))).toBe(true);
    });
    it('scope own: chỉ chủ', () => {
        expect(FanpageAccessHelper.allows('own', ctx({ userId: 1 }))).toBe(true);
        expect(FanpageAccessHelper.allows('own', ctx())).toBe(false);
    });
    it('scope own KHÔNG mở theo phòng ban', () => {
        expect(FanpageAccessHelper.allows('own', ctx({ managedDepartmentIds: [5] }))).toBe(false);
    });
    it('scope department: cùng phòng ban quản lý -> true; khác -> false', () => {
        expect(FanpageAccessHelper.allows('department', ctx({ managedDepartmentIds: [5] }))).toBe(true);
        expect(FanpageAccessHelper.allows('department', ctx({ managedDepartmentIds: [9] }))).toBe(false);
    });
    it('scope department: Page chưa có chủ -> false', () => {
        expect(
            FanpageAccessHelper.allows('department', ctx({ ownerIds: [], ownerDepartmentIds: [], managedDepartmentIds: [5] })),
        ).toBe(false);
    });
    it('scope department: vẫn thao tác được Page mình là chủ dù khác phòng ban', () => {
        expect(FanpageAccessHelper.allows('department', ctx({ userId: 1, managedDepartmentIds: [9] }))).toBe(true);
    });
});

describe('FanpageAccessHelper nhiều người phụ trách', () => {
    it('scope own: là 1 trong nhiều người phụ trách -> true', () => {
        expect(FanpageAccessHelper.allows('own', ctx({ userId: 2, ownerIds: [1, 2, 3] }))).toBe(true);
        expect(FanpageAccessHelper.allows('own', ctx({ userId: 9, ownerIds: [1, 2, 3] }))).toBe(false);
    });
    it('scope department: BẤT KỲ người phụ trách nào thuộc phòng ban quản lý -> true', () => {
        const c = ctx({ ownerIds: [1, 2], ownerDepartmentIds: [7, 5], managedDepartmentIds: [5] });
        expect(FanpageAccessHelper.allows('department', c)).toBe(true);
        expect(FanpageAccessHelper.allows('department', { ...c, managedDepartmentIds: [8] })).toBe(false);
    });
});

describe('FanpageAccessHelper giao Page', () => {
    it('canAssignOwner chỉ all/department', () => {
        expect(FanpageAccessHelper.canAssignOwner('all')).toBe(true);
        expect(FanpageAccessHelper.canAssignOwner('department')).toBe(true);
        expect(FanpageAccessHelper.canAssignOwner('own')).toBe(false);
        expect(FanpageAccessHelper.canAssignOwner(null)).toBe(false);
    });
    it('canAssignTo', () => {
        expect(FanpageAccessHelper.canAssignTo('all', null, [])).toBe(true);
        expect(FanpageAccessHelper.canAssignTo('department', 5, [5])).toBe(true);
        expect(FanpageAccessHelper.canAssignTo('department', 6, [5])).toBe(false);
        expect(FanpageAccessHelper.canAssignTo('department', null, [5])).toBe(false);
        expect(FanpageAccessHelper.canAssignTo('own', 5, [5])).toBe(false);
    });
});