import { FanpageAccessHelper, FanpageAccessContext } from './fanpage-access.helper';

const ctx = (over: Partial<FanpageAccessContext> = {}): FanpageAccessContext => ({
    userId: 10,
    ownerId: 1,
    ownerDepartmentId: 5,
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
        expect(FanpageAccessHelper.allows('all', ctx({ ownerId: null, ownerDepartmentId: null }))).toBe(true);
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
            FanpageAccessHelper.allows('department', ctx({ ownerId: null, ownerDepartmentId: null, managedDepartmentIds: [5] })),
        ).toBe(false);
    });
    it('scope department: vẫn thao tác được Page mình là chủ dù khác phòng ban', () => {
        expect(FanpageAccessHelper.allows('department', ctx({ userId: 1, managedDepartmentIds: [9] }))).toBe(true);
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