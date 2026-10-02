import { DEMO_PEOPLE } from './personas';

/** Khách hàng MẪU (hình dạng giống response `Customer` mà bảng thật dùng). */
export interface DemoCustomer {
    id: number;
    inputDate: string;
    name: string;
    phone: string | null;
    source: string;
    utm: { name: string; color: string } | null;
    departmentId: number;
    createdById: number;
    salesUser: { id: number; name: string } | null;
    activeAssignees: { id: number; name: string }[];
    marketingUser: { id: number; name: string } | null;
    status: { name: string; color: string };
    joinedGroups: { id: number; name: string }[];
    totalDeposit: number;
    recentNote: string;
}

const P = DEMO_PEOPLE;
const st = {
    closed: { name: 'Đã chốt', color: 'green' },
    pending: { name: 'Chờ xử lý', color: 'gold' },
    potential: { name: 'Tiềm năng', color: 'blue' },
};

export const DEMO_CUSTOMERS: DemoCustomer[] = [
    {
        id: 1, inputDate: '2026-09-28', name: 'Nguyễn Văn A', phone: '0901234567', source: 'Facebook',
        utm: { name: 'FB_Q4', color: '#1677ff' }, departmentId: 1, createdById: P.salesA.id,
        salesUser: P.salesA, activeAssignees: [P.salesA, P.salesB], marketingUser: P.marketingM,
        status: st.closed, joinedGroups: [{ id: 1, name: 'VIP Gold' }, { id: 2, name: 'Zalo 1' }],
        totalDeposit: 1000, recentNote: 'Sales An: Đã nạp lần 1 (29/9/26)',
    },
    {
        id: 2, inputDate: '2026-09-29', name: 'Trần Thị B', phone: '0912345678', source: 'TikTok',
        utm: { name: 'TT_Summer', color: '#eb2f96' }, departmentId: 3, createdById: P.marketingM.id,
        salesUser: null, activeAssignees: [], marketingUser: P.marketingM,
        status: st.pending, joinedGroups: [], totalDeposit: 0, recentNote: '',
    },
    {
        id: 3, inputDate: '2026-09-30', name: 'Lê Văn C', phone: null, source: 'Google',
        utm: null, departmentId: 1, createdById: P.salesB.id,
        salesUser: P.salesB, activeAssignees: [P.salesB], marketingUser: null,
        status: st.potential, joinedGroups: [{ id: 2, name: 'Zalo 1' }], totalDeposit: 0, recentNote: 'Sales Bình: Hẹn gọi lại (30/9/26)',
    },
    {
        id: 4, inputDate: '2026-10-01', name: 'Phạm Thị D', phone: '0934567890', source: 'Instagram',
        utm: { name: 'IG_Reel', color: '#722ed1' }, departmentId: 3, createdById: P.contentC.id,
        salesUser: null, activeAssignees: [], marketingUser: null,
        status: st.pending, joinedGroups: [], totalDeposit: 0, recentNote: '',
    },
    {
        id: 5, inputDate: '2026-10-01', name: 'Hoàng Văn E', phone: '0945678901', source: 'Facebook',
        utm: { name: 'FB_Q4', color: '#1677ff' }, departmentId: 2, createdById: P.salesD.id,
        salesUser: P.salesD, activeAssignees: [P.salesD], marketingUser: null,
        status: st.closed, joinedGroups: [{ id: 1, name: 'VIP Gold' }], totalDeposit: 2500, recentNote: 'Sales Dũng: Đã chốt (1/10/26)',
    },
    {
        id: 6, inputDate: '2026-10-02', name: 'Vũ Thị F', phone: '0956789012', source: 'Google',
        utm: { name: 'GG_Brand', color: '#52c41a' }, departmentId: 2, createdById: P.admin.id,
        salesUser: null, activeAssignees: [], marketingUser: null,
        status: st.pending, joinedGroups: [], totalDeposit: 0, recentNote: '',
    },
];
