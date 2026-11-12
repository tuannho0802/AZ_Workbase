'use client';

import { App, Form, Input, Select } from 'antd';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { customersApi } from '@/lib/api/customers.api';
import { LEAD_PHONE_RE, defaultLeadSource, describeLeadDuplicate } from '@/lib/utils/fanpageLead';

interface FieldsProps {
    /** Tên nền tảng của Page - nguồn mặc định (Q11) khi khớp 1 nguồn đang mở. */
    platformName?: string;
}

/**
 * Trường nhập Lead - dùng chung cho modal "Thêm khách" (tab Data khách hàng) và mục "Thêm khách hàng từ ghi chú này".
 * Phải đặt BÊN TRONG một antd `<Form>` do component cha sở hữu. SĐT BẮT BUỘC (khoá chống trùng, PLAN 15.8).
 */
export function FanpageLeadFields({ platformName }: FieldsProps) {
    const { sources } = useMediaSources(true);
    const names = sources.map((s) => s.name);
    const fallback = defaultLeadSource(platformName, names);

    return (
        <>
            <Form.Item name="name" label="Họ và tên" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập họ tên' }, { max: 100, message: 'Tối đa 100 ký tự' }]}>
                <Input maxLength={100} placeholder="Nguyễn Văn A" />
            </Form.Item>
            <Form.Item
                name="phone"
                label="Số điện thoại"
                extra="Bắt buộc - dùng để chống trùng khách."
                rules={[{ required: true, message: 'Vui lòng nhập số điện thoại' }, { pattern: LEAD_PHONE_RE, message: 'Số điện thoại không hợp lệ (Ví dụ: 0912345678)' }]}
            >
                <Input maxLength={20} placeholder="0912345678" />
            </Form.Item>
            <Form.Item name="email" label="Email (tuỳ chọn)" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
                <Input maxLength={255} placeholder="khach@example.com" />
            </Form.Item>
            <Form.Item
                name="source"
                label="Nguồn"
                extra={fallback ? `Bỏ trống = “${fallback}” (theo nền tảng của Page).` : undefined}
                rules={fallback ? [] : [{ required: true, message: 'Vui lòng chọn nguồn khách hàng' }]}
            >
                <Select allowClear showSearch placeholder={fallback ? `Mặc định: ${fallback}` : 'Chọn nguồn'} options={names.map((n) => ({ value: n, label: n }))} />
            </Form.Item>
            <Form.Item name="note" label="Ghi chú cho khách (tuỳ chọn)">
                <Input.TextArea rows={2} maxLength={5000} />
            </Form.Item>
        </>
    );
}

/**
 * Kiểm tra trùng SĐT TRƯỚC khi gửi (X30): trùng -> hiện cảnh báo (chỉ tên người tạo/Sales/nhóm, không lộ id/SĐT) và trả `false`
 * để KHÔNG lưu (kể cả ghi chú). Lỗi mạng của bước kiểm tra không chặn - BE vẫn chặn trùng bằng UNIQUE phone.
 */
export function useLeadDuplicateCheck() {
    const { modal } = App.useApp();
    return async (phone: string, email?: string): Promise<boolean> => {
        try {
            const dup = await customersApi.checkDuplicateContact({ phone, email });
            if (!dup.hasDuplicate) return true;
            const lines = [dup.phoneMatch && describeLeadDuplicate(dup.phoneMatch)].filter((x): x is string => !!x);
            if (dup.emailMatch) lines.push(`Email này đã tồn tại ở khách hàng khác (người tạo: ${dup.emailMatch.creatorName}).`);
            modal.error({
                title: 'Khách hàng đã tồn tại',
                content: (
                    <div>
                        {lines.map((l) => (
                            <p key={l} style={{ marginBottom: 4 }}>
                                {l}
                            </p>
                        ))}
                        <p style={{ marginBottom: 0 }}>Hãy sửa số điện thoại hoặc bỏ phần thêm khách. Khách cũ không được tự gắn vào Page.</p>
                    </div>
                ),
                okText: 'Đã hiểu',
            });
            return false;
        } catch {
            return true;
        }
    };
}