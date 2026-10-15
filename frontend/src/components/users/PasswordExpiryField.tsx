'use client';

import { Form, InputNumber, Radio, Space } from 'antd';

interface ControlProps {
  value?: number | null;
  onChange?: (value: number | null) => void;
}

/** Điều khiển nhỏ: "Vô hạn" hoặc "N ngày". Giá trị form: `null` = vô hạn, số = số ngày. */
function PasswordExpiryControl({ value, onChange }: ControlProps) {
  const limited = typeof value === 'number';
  return (
    <Space orientation="vertical" size={8}>
      <Radio.Group
        value={limited ? 'days' : 'unlimited'}
        onChange={(e) => onChange?.(e.target.value === 'days' ? (typeof value === 'number' ? value : 90) : null)}
      >
        <Radio value="unlimited">Vô hạn</Radio>
        <Radio value="days">Có hạn</Radio>
      </Radio.Group>
      {limited && (
        <Space>
          <InputNumber
            min={1}
            max={365}
            precision={0}
            value={value}
            onChange={(v) => onChange?.(typeof v === 'number' ? v : null)}
            aria-label="Số ngày hạn mật khẩu"
          />
          <span>ngày</span>
        </Space>
      )}
    </Space>
  );
}

/**
 * P6: lựa chọn "Hạn mật khẩu" khi Admin tạo nhân viên / đặt lại mật khẩu. Field `passwordExpiryDays`:
 * `null`/bỏ trống = vô hạn. Dù chọn gì, tài khoản vẫn bị buộc đổi mật khẩu ở lần đăng nhập kế tiếp.
 */
export function PasswordExpiryField() {
  return (
    <Form.Item
      name="passwordExpiryDays"
      label="Hạn mật khẩu"
      initialValue={null}
      extra="Nhân viên luôn phải đổi mật khẩu ở lần đăng nhập kế tiếp. Hết hạn sẽ bị buộc đổi lại."
    >
      <PasswordExpiryControl />
    </Form.Item>
  );
}
