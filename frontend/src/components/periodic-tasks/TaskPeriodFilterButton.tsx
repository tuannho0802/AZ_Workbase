'use client';

import { useState } from 'react';
import { Popover, Button, Badge, Space, DatePicker } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { DateRangeTuple, getThisWeekRange, MAX_TASK_RANGE_DAYS } from '@/lib/utils/periodicTaskRange';

const { RangePicker } = DatePicker;

interface TaskPeriodFilterButtonProps {
    value: DateRangeTuple;
    onChange: (next: DateRangeTuple) => void;
}

/**
 * TaskPeriodFilterButton - nút phễu lọc danh sách Task gợi ý (dropdown "Công
 * việc con" ở `TaskLinksModal`) theo `PeriodDate` (`periodStartDate`/
 * `periodEndDate`). Mirror ĐÚNG kiểu Popover của `CustomerQuickFilterButton`
 * (`customer-quick-filter.tsx`) để đồng bộ UX 2 nút phễu cạnh nhau trong
 * cùng modal.
 *
 * Mặc định "Tuần này" (`getThisWeekRange()`, Thứ 2 -> Chủ nhật) theo đúng
 * yêu cầu chủ dự án - KHÔNG lấy theo Kỳ hạn của Task đang xem như dropdown
 * "Công việc cha" (giữ nguyên hành vi cũ ở đó), vì mục đích ở đây là cho
 * phép người dùng tự do tìm Task con ở khoảng ngày bất kỳ, không bị bó theo
 * Kỳ hạn Task cha. `clampRange` (giới hạn tối đa `MAX_TASK_RANGE_DAYS` ngày)
 * vẫn được áp dụng ở nơi gọi (`TaskLinksModal`) trước khi truyền lên API -
 * component này chỉ giữ giá trị RangePicker thô.
 */
export function TaskPeriodFilterButton({ value, onChange }: TaskPeriodFilterButtonProps) {
    const [open, setOpen] = useState(false);
    const thisWeek = getThisWeekRange();
    const isDefault = value[0].isSame(thisWeek[0], 'day') && value[1].isSame(thisWeek[1], 'day');

    const content = (
        <Space orientation="vertical" size={10} style={{ width: 280 }}>
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
            <Button size="small" block onClick={() => onChange(getThisWeekRange())} disabled={isDefault}>
                Về Tuần này
            </Button>
        </Space>
    );

    return (
        <Popover
            content={content}
            title="Lọc Công việc con theo Ngày kỳ"
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomRight"
        >
            <Badge dot={!isDefault} offset={[-4, 4]}>
                <Button icon={<FilterOutlined />} title="Lọc Công việc con theo khoảng Ngày kỳ (mặc định Tuần này)" />
            </Badge>
        </Popover>
    );
}
