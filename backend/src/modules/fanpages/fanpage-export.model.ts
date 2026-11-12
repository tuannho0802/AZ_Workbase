import { guardFormula, safeSheetName } from '../leave-requests/leave-export.model';
import type { ExportCell, ExportColumn, ExportTable } from '../leave-requests/leave-export.model';
import type { CadenceState } from './helpers/fanpage-cadence.helper';

/**
 * Model xuất Excel Fanpage (A4) - HÀM THUẦN, không đụng DB/exceljs (mirror `leave-export.model`). Service nạp dữ liệu đã QUA CỔNG QUYỀN rồi
 * đưa vào đây; model chỉ lo cột/định dạng/chống formula injection. Nguyên tắc quyền (PLAN 3.7, GĐ6):
 *  - Sheet \"Số liệu\" chỉ có khi `includeMetrics`;
 *  - Sheet \"Khách & Tiền nạp\" chỉ có khi service truyền `outcomes` (đã qua phạm vi khách `customers.view`);
 *  - CỘT TIỀN chỉ có khi `outcomes.hasRevenue` (đã qua cổng 4 lớp) - không có thì KHÔNG có cột (không để cột trống gợi ý).
 */

/** Trần dòng mỗi sheet (PLAN 6.3). */
export const FANPAGE_EXPORT_ROW_CAP = 20_000;

export const CADENCE_EXPORT_LABEL: Record<CadenceState, string> = {
    paused: 'Tạm ngừng',
    new: 'Mới',
    silent: 'Im lặng',
    at_risk: 'Nguy cơ trễ',
    ok: 'Ổn',
};

export interface ExportPageRow {
    name: string;
    platform: string | null;
    url: string;
    owners: string[];
    health: string | null;
    isTracked: boolean;
    archived: boolean;
    cadenceState: CadenceState;
    weekCount: number;
    target: number | null;
    posts30d: number;
    lastPostDate: string | null;
    postCount: number;
    followers: number | null;
    followersDate: string | null;
}

export interface ExportPostRow {
    pageName: string;
    postedDate: string | null;
    postType: string | null;
    title: string | null;
    url: string;
    createdBy: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    note: string | null;
}

export interface ExportSnapshotRow {
    pageName: string;
    date: string;
    followers: number | null;
    reach: number | null;
    engagement: number | null;
    views: number | null;
    note: string | null;
    createdBy: string | null;
}

export interface ExportOutcomePageRow {
    name: string;
    archived: boolean;
    posts: number;
    primaryCustomers: number;
    primaryClosed: number;
    primaryCloseRate: number | null;
    /** undefined = Page này không qua cổng tiền. */
    primaryDeposit?: number;
    participatingCustomers: number;
    participatingClosed: number;
    customersPerPost: number | null;
}

export interface ExportOutcomes {
    from: string;
    to: string;
    /** true = ÍT NHẤT một dòng có trường tiền (đã qua cổng 4 lớp). */
    hasRevenue: boolean;
    rows: ExportOutcomePageRow[];
    total: { customers: number; closed: number; closeRate: number | null; deposit?: number };
    unassigned: { customers: number; closed: number } | null;
}

export interface BuildFanpageExportInput {
    pages: ExportPageRow[];
    posts: ExportPostRow[];
    snapshots: ExportSnapshotRow[];
    /** Quyền xem số liệu định kỳ -> mới có sheet \"Số liệu\". */
    includeMetrics: boolean;
    outcomes: ExportOutcomes | null;
    period: { from: string | null; to: string | null };
    /** Sheet nào bị cắt ở trần dòng. */
    truncated: { pages?: boolean; posts?: boolean; snapshots?: boolean };
}

export interface FanpageExportSheet {
    name: string;
    table: ExportTable;
}

export interface FanpageExportModel {
    title: string;
    period: { from: string | null; to: string | null };
    isEmpty: boolean;
    sheets: FanpageExportSheet[];
}

const text = (v: string | null | undefined): string => guardFormula(v ?? '');
const col = (key: string, header: string, type: ExportColumn['type'], width: number): ExportColumn => ({ key, header, type, width });
const yesNo = (v: boolean): string => (v ? 'Có' : 'Không');

function table(
    id: string,
    title: string,
    columns: ExportColumn[],
    rows: ExportCell[][],
    extra: Partial<Pick<ExportTable, 'totalsRow' | 'note'>> & { truncated?: boolean } = {},
): ExportTable {
    const truncated = extra.truncated === true;
    return {
        id,
        title,
        columns,
        rows,
        totalRows: rows.length,
        truncated,
        ...(extra.totalsRow && rows.length > 0 ? { totalsRow: extra.totalsRow } : {}),
        ...(truncated
            ? { note: `Chỉ xuất ${FANPAGE_EXPORT_ROW_CAP.toLocaleString('vi-VN')} dòng đầu - hãy thu hẹp bộ lọc/kỳ để xuất phần còn lại.` }
            : extra.note
                ? { note: extra.note }
                : {}),
    };
}

export function buildPagesTable(pages: ExportPageRow[], truncated = false): ExportTable {
    const columns = [
        col('name', 'Tên Page', 'text', 28),
        col('platform', 'Nền tảng', 'text', 14),
        col('url', 'Link Page', 'text', 36),
        col('owners', 'Người phụ trách', 'text', 28),
        col('health', 'Tình trạng', 'text', 16),
        col('tracked', 'Đang theo dõi', 'text', 14),
        col('archived', 'Lưu trữ', 'text', 10),
        col('cadence', 'Nhịp đăng', 'text', 14),
        col('week', 'Bài tuần này', 'number', 12),
        col('target', 'Mục tiêu/tuần', 'number', 13),
        col('posts30d', 'Bài 30 ngày', 'number', 12),
        col('lastPost', 'Đăng gần nhất', 'date', 14),
        col('total', 'Tổng bài', 'number', 10),
        col('followers', 'Follower (nhập tay mới nhất)', 'number', 18),
        col('followersDate', 'Ngày số liệu', 'date', 14),
    ];
    const rows: ExportCell[][] = pages.map((p) => [
        text(p.name),
        text(p.platform),
        text(p.url),
        text(p.owners.join(', ')),
        text(p.health),
        yesNo(p.isTracked),
        yesNo(p.archived),
        CADENCE_EXPORT_LABEL[p.cadenceState],
        p.weekCount,
        p.target,
        p.posts30d,
        p.lastPostDate,
        p.postCount,
        p.followers,
        p.followersDate,
    ]);
    return table('pages', 'Danh sách Page', columns, rows, { truncated });
}

export function buildPostsTable(posts: ExportPostRow[], truncated = false): ExportTable {
    const columns = [
        col('page', 'Page', 'text', 26),
        col('date', 'Ngày đăng', 'date', 13),
        col('type', 'Loại bài', 'text', 14),
        col('title', 'Tiêu đề', 'text', 30),
        col('url', 'Link bài', 'text', 40),
        col('by', 'Người ghi', 'text', 20),
        col('views', 'Lượt xem', 'number', 11),
        col('likes', 'Thích', 'number', 9),
        col('comments', 'Bình luận', 'number', 11),
        col('shares', 'Chia sẻ', 'number', 10),
        col('note', 'Ghi chú', 'text', 30),
    ];
    const rows: ExportCell[][] = posts.map((p) => [
        text(p.pageName),
        p.postedDate,
        text(p.postType),
        text(p.title),
        text(p.url),
        text(p.createdBy),
        p.views,
        p.likes,
        p.comments,
        p.shares,
        text(p.note),
    ]);
    return table('posts', 'Bài đăng', columns, rows, { truncated });
}

export function buildSnapshotsTable(snaps: ExportSnapshotRow[], truncated = false): ExportTable {
    const columns = [
        col('page', 'Page', 'text', 26),
        col('date', 'Ngày', 'date', 13),
        col('followers', 'Follower', 'number', 12),
        col('reach', 'Tiếp cận', 'number', 12),
        col('engagement', 'Tương tác', 'number', 12),
        col('views', 'Lượt xem', 'number', 12),
        col('note', 'Ghi chú', 'text', 30),
        col('by', 'Người nhập', 'text', 20),
    ];
    const rows: ExportCell[][] = snaps.map((s) => [
        text(s.pageName),
        s.date,
        s.followers,
        s.reach,
        s.engagement,
        s.views,
        text(s.note),
        text(s.createdBy),
    ]);
    return table('snapshots', 'Số liệu định kỳ (nhập tay)', columns, rows, { truncated });
}

/**
 * Khách & Tiền nạp theo Page (D1/D3). Cột Tiền nạp CHỈ có khi `hasRevenue`; dòng \"Tổng\" luôn là đếm DISTINCT do service tính
 * (KHÔNG cộng các dòng Page - R4). Page tham gia (dùng chung) không cộng vào tổng - ghi rõ ở ghi chú.
 */
export function buildOutcomesTable(o: ExportOutcomes): ExportTable {
    const money = o.hasRevenue;
    const columns: ExportColumn[] = [
        col('page', 'Page', 'text', 28),
        col('posts', 'Bài trong kỳ', 'number', 13),
        col('customers', 'Khách (ghi công)', 'number', 16),
        col('closed', 'Đã chốt', 'number', 10),
        col('rate', '% chốt', 'number', 10),
        ...(money ? [col('deposit', 'Tiền nạp (ghi công)', 'number', 18)] : []),
        col('cpp', 'Khách / bài', 'number', 12),
        col('pCustomers', 'Khách (dùng chung)', 'number', 17),
        col('pClosed', 'Chốt (dùng chung)', 'number', 16),
    ];
    const rows: ExportCell[][] = o.rows.map((r) => [
        text(r.archived ? `${r.name} (đã lưu trữ)` : r.name),
        r.posts,
        r.primaryCustomers,
        r.primaryClosed,
        r.primaryCloseRate,
        ...(money ? [r.primaryDeposit ?? null] : []),
        r.customersPerPost,
        r.participatingCustomers,
        r.participatingClosed,
    ]);
    if (o.unassigned) {
        rows.push([
            'Chưa quy về Page',
            null,
            o.unassigned.customers,
            o.unassigned.closed,
            o.unassigned.customers > 0 ? Math.round((o.unassigned.closed / o.unassigned.customers) * 1000) / 10 : null,
            ...(money ? [null] : []),
            null,
            null,
            null,
        ]);
    }
    const totalsRow: ExportCell[] = [
        'Tổng (đếm riêng, không cộng dòng Page)',
        null,
        o.total.customers,
        o.total.closed,
        o.total.closeRate,
        ...(money ? [o.total.deposit ?? null] : []),
        null,
        null,
        null,
    ];
    const note =
        `Kỳ ${o.from} → ${o.to} · Khách theo ngày nhập, theo phạm vi dữ liệu của người xuất. ` +
        'Cột \"dùng chung\" là Page tham gia - KHÔNG cộng vào tổng.';
    return table('outcomes', 'Khách & Tiền nạp theo Page', columns, rows, { totalsRow, note });
}

export function buildFanpageExportModel(input: BuildFanpageExportInput): FanpageExportModel {
    const used = new Set<string>();
    const sheets: FanpageExportSheet[] = [
        { name: safeSheetName('Page', used), table: buildPagesTable(input.pages, input.truncated.pages) },
        { name: safeSheetName('Bài đăng', used), table: buildPostsTable(input.posts, input.truncated.posts) },
    ];
    if (input.includeMetrics) {
        sheets.push({ name: safeSheetName('Số liệu', used), table: buildSnapshotsTable(input.snapshots, input.truncated.snapshots) });
    }
    if (input.outcomes) {
        sheets.push({ name: safeSheetName('Khách & Tiền nạp', used), table: buildOutcomesTable(input.outcomes) });
    }
    return { title: 'Fanpage', period: input.period, isEmpty: input.pages.length === 0, sheets };
}