'use client';

import { Form, ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';
import { DEFAULT_ENTITY_COLOR } from '@/lib/utils/entityColor';

/**
 * Field chọn màu dùng chung cho 4 trang quản lý CRUD có cột `color` mới
 * (Phòng ban / Vị trí / Role / Quản lý phụ trách - xem migration
 * AddColorToRbacGroupingTables1781300000000). Luôn chuẩn hoá giá trị lưu vào
 * Form thành chuỗi hex `#RRGGBB` (khớp regex BE `^#[0-9A-Fa-f]{6}$`), KHÔNG
 * bao giờ để Form giữ object `Color` của AntD - tránh phải tự convert lại ở
 * từng `handleSubmit`.
 */
export function ColorPickerField({
  label = 'Màu hiển thị (Tag)',
  name = 'color',
  extra = 'Màu Tag hiển thị cho mục này ở các trang liên quan.',
}: {
  label?: string;
  name?: string;
  extra?: string;
}) {
  return (
    <Form.Item
      name={name}
      label={label}
      extra={extra}
      initialValue={DEFAULT_ENTITY_COLOR}
      getValueFromEvent={(color: Color | string) =>
        typeof color === 'string' ? color : color.toHexString()
      }
    >
      <ColorPicker format="hex" disabledAlpha showText />
    </Form.Item>
  );
}
