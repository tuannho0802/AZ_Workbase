'use client';

import { useState } from 'react';
import { Popover, Button, Badge, Space, DatePicker } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import {
    DateRangeTuple,
    getTodayRange,
    getThisWeekRange,
    getThisMonthRange,
    MAX_TASK_RANGE_DAYS,
} from '@/lib/utils/periodicTaskRange';

const { RangePicker } = DatePicker;

interface TaskPeriodFilterButtonProps {
    value: DateRangeTuple;
    onChange: (next: DateRangeTuple) => void;
    /** Tên đối tượng đang lọc, chèn vào title/tooltip (VD: "Công việc cha",
     * "Công việc con"). Mặc định "Công việc con" để không phá usage cũ. */
    label?: string;
}

const isSameRange = (a: DateRangeTuple, b: DateRangeTuple) => a[0].isSame(b[0], 'day') && a[1].isSame(b[1], 'day');

/**
 * TaskPeriodFilterButton - nút phễu lọc danh sách Task gợi ý (dropdown "Công
 * việc cha"/"Công việc con" ở `TaskLinksModal`) theo `PeriodDate`
 * (`periodStartDate`/`periodEndDate`). Mirror ĐÚNG kiểu Popover của
 * `CustomerQuickFilterButton` (`customer-quick-filter.tsx`) để đồng bộ UX
 * các nút phễu cạnh nhau trong cùng modal.
 *
 * 3 nút bấm nhanh "Hôm nay"/"Tuần này"/"Tháng này" (yêu cầu chủ dự án, ảnh
 * chụp "Thiếu Filter") - nút đang khớp `value` hiện tại được tô `type="primary"`
 * để người dùng biết đang ở preset nào; chấm đỏ (`Badge dot`) trên icon phễu
 * chỉ bật khi `value` KHÔNG khớp preset nào (nghĩa là đang chọn khoảng ngày
 * tuỳ ý qua RangePicker) - không gắn cứng theo 1 preset "mặc định" duy nhất
 * vì component này giờ dùng chung cho cả dropdown cha (mặc định khoá theo Kỳ
 * hạn Task đang xem, xem `TaskLinksModal`) lẫn dropdown con (mặc định "Tuần
 * này") - 2 nơi có khái niệm "mặc định" khác nhau, nên badge chỉ nên phản
 * ánh "có đang custom hay không", không phải "có đang = default hay không".
 * `clampRange` (giới hạn tối đa `MAX_TASK_RANGE_DAYS` ngày) vẫn được áp dụng
 * ở nơi gọi (`TaskLinksModal`) trước khi truyền lên API - component này chỉ
 * giữ giá trị RangePicker/preset thô.
 */
export function TaskPeriodFilterButton({ value, onChange, label = 'Công việc con' }: TaskPeriodFilterButtonProps) {
    const [open, setOpen] = useState(false);

    const presets = [
        { key: 'today', text: 'Hôm nay', range: getTodayRange() },
        { key: 'week', text: 'Tuần này', range: getThisWeekRange() },
        { key: 'month', text: 'Tháng này', range: getThisMonthRange() },
    ] as const;
    const activePresetKey = presets.find((p) => isSameRange(value, p.range))?.key;
    const isCustomRange = !activePresetKey;

    const content = (
        <Space orientation="vertical" size={10} style={{ width: 280 }}>
            <Space.Compact block>
                {presets.map((p) => (
                    <Button
                        key={p.key}
                        size="small"
                        type={activePresetKey === p.key ? 'primary' : 'default'}
                        onClick={() => onChange(p.range)}
                        style={{ flex: 1 }}
                    >
                        {p.text}
                    </Button>
                ))}
            </Space.Compact>
            <div>
                <div style={{ fontSize: 12, marginBottom: 4, color: 'rgba(0,0,0,0.65)' }}>
                    Khoảng Ngày kỳ (tối đa {MAX_TASK_RANGE_DAYS} ngày)
                </div>
                <RangePicker
                    style={{ width: '100%' }}
                    format="DD/MM/YYYY"
                    value={value}
                    onChange={(dates) => {
                        if (dates?.[0] && dates?.[1]) onChange([dates[0], dates[1]]);
                    }}
                />
            </div>
        </Space>
    );

    return (
        <Popover
            content={content}
            title={`Lọc ${label} theo Ngày kỳ`}
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomRight"
        >
            <Badge dot={isCustomRange} offset={[-4, 4]}>
                <Button icon={<FilterOutlined />} title={`Lọc ${label} theo khoảng Ngày kỳ`} />
            </Badge>
        </Popover>
    );
}
