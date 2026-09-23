'use client';

import { Avatar, Space, Tag, Typography } from 'antd';

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
}: UserMiniCardProps) {
    const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    return (
        <Space
            size={6}
            align="center"
            wrap
            style={{
                display: 'inline-flex',
                padding: '3px 10px 3px 3px',
                borderRadius: 20,
                background: '#fafafa',
                border: '1px solid #f0f0f0',
            }}
        >
            <Avatar size={20} style={{ backgroundColor: getRoleColor(role), fontSize: 11, flexShrink: 0 }}>
                {name?.[0]?.toUpperCase()}
            </Avatar>
            <Text strong style={{ fontSize: nameFontSize }}>
                {name}
            </Text>
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
        </Space>
    );
}