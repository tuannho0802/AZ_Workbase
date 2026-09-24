'use client';

import { Avatar, Tag, Typography } from 'antd';

const { Text } = Typography;

export interface UserMiniCardProps {
    name: string;
    role?: string;
    departmentName?: string | null;
    positionName?: string | null;
    getRoleColor: (code?: string | null) => string;
    getRoleName: (code?: string) => string;
    /** Nội dung phụ hiện ngay sau tên (vd "(tên trên máy)") - tuỳ chỗ gọi. */
    subtitle?: React.ReactNode;
    /**
     * Ẩn Tag Vai trò (chỉ còn Avatar + tên) - dùng ở chỗ cột hẹp, Tag dễ bị
     * xuống dòng (vd cột "Người tạo" ở /chia-data). Avatar vẫn tô màu theo
     * `getRoleColor(role)` như cũ, chỉ ẩn phần Tag text.
     */
    hideRoleTag?: boolean;
    /** Cỡ chữ tên, mặc định 13 - truyền nhỏ hơn cho chỗ cần gọn (vd 12). */
    nameFontSize?: number;
    /** Bo góc card, mặc định 20 (dạng viên thuốc) - truyền nhỏ (vd 6) cho dạng "vuông". */
    borderRadius?: number;
    /** Hình Avatar, mặc định `circle` - `square` cho đồng bộ với card vuông. */
    avatarShape?: 'circle' | 'square';
}

/**
 * Mini-card gọn cho 1 nhân viên hệ thống: Avatar + tên + Tag Vai
 * trò/Phòng ban/Vị trí, gói chung trong 1 khối bo tròn nền xám nhạt.
 *
 * ⚠️ MỚI (2026-09-11) - trước đây mỗi tab tự vẽ rời rạc `<Space wrap>` với
 * nhiều `<Tag>` trôi nổi cạnh tên (xem lịch sử ở AttendanceSummaryTab.tsx/
 * AttendanceLogsTab.tsx/DeviceMappingTab.tsx/AttendanceMonthlyTab.tsx) -
 * người dùng phản hồi qua ảnh chụp là khó nhìn, đề nghị gom lại thành 1 khối
 * "card mini" chung. Dùng CHUNG component này ở cả 4 chỗ hiển thị thông tin
 * nhân viên trong tab Máy chấm công thay vì tự vẽ riêng từng nơi, để đồng bộ
 * và dễ sửa 1 chỗ cho cả 4 nếu cần đổi style sau này.
 */
export function UserMiniCard({
    name,
    role,
    departmentName,
    positionName,
    getRoleColor,
    getRoleName,
    subtitle,
    hideRoleTag = false,
    nameFontSize = 13,
    borderRadius = 20,
    avatarShape = 'circle',
}: UserMiniCardProps) {
    const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    // ⚠️ FIX BUG UI THẬT (tên dài làm card cao lên/xấu, thấy rõ ở cột Sales/
    // Marketing/Người tạo của /customers/reports/invalid-data): trước đây cả
    // Avatar + tên + Tag nằm chung 1 `<Space wrap>` - khi tên dài hơn bề
    // rộng cột, Space đẩy nguyên khối tên xuống DÒNG 2 (dưới Avatar) làm
    // card cao gấp đôi, lệch hàng. Giờ: Avatar + tên luôn gói trong 1 nhóm
    // KHÔNG xuống dòng, tên tự cắt bằng "…" (hover xem đủ tên qua `title`);
    // chỉ các Tag/subtitle phía sau mới được xuống dòng (giữ hành vi cũ ở
    // chỗ có Tag Vai trò/Phòng ban/Vị trí). `maxWidth: 100%` + `minWidth: 0`
    // để card không bao giờ tràn ra ngoài ô chứa nó. Sửa ở component dùng
    // chung nên áp dụng cho MỌI nơi dùng UserMiniCard (/chia-data, thùng
    // rác, phòng ban, máy chấm công, thông báo, form khách hàng...).
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                verticalAlign: 'middle',
                padding: '3px 10px 3px 3px',
                borderRadius,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    maxWidth: '100%',
                }}
            >
                <Avatar size={20} shape={avatarShape} style={{ backgroundColor: getRoleColor(role), fontSize: 11, flexShrink: 0 }}>
                    {name?.[0]?.toUpperCase()}
                </Avatar>
                <Text
                    strong
                    title={name}
                    style={{
                        fontSize: nameFontSize,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {name}
                </Text>
            </span>
            {subtitle}
            {role && !hideRoleTag && (
                <Tag style={tagStyle} color={getRoleColor(role)}>
                    {getRoleName(role)}
                </Tag>
            )}
            {departmentName && (
                <Tag style={tagStyle} color="default">
                    {departmentName}
                </Tag>
            )}
            {positionName && (
                <Tag style={tagStyle} color="default">
                    {positionName}
                </Tag>
            )}
        </div>
    );
}