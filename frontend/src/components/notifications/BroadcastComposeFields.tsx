'use client';

import { Form, Input, Radio, Select, Alert, Space, Typography } from 'antd';
import type { BroadcastComposeState } from '@/lib/hooks/useBroadcastCompose';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * Thân form soạn thông báo thủ công - tách khỏi khung hiển thị (Modal hoặc
 * Card style-như-modal) để 2 nơi dùng chung ĐÚNG 1 bộ trường, không lệch
 * nhau khi sửa sau này (PLAN mục 7.7).
 */
export function BroadcastComposeFields({ state }: { state: BroadcastComposeState }) {
  const {
    form,
    audienceType,
    setAudienceType,
    markDirty,
    canSelectAll,
    userOptions,
    usersLoading,
    departmentOptions,
    deptsLoading,
    previewResult,
    dirtySincePreview,
    handlePreview,
    previewPending,
  } = state;

  return (
    <Form form={form} layout="vertical" onValuesChange={markDirty}>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="Không đưa SĐT/email/số tiền của khách hàng vào nội dung. Người nhận được chốt tại thời điểm gửi."
      />
      <Form.Item
        name="title"
        label="Tiêu đề"
        rules={[{ required: true, message: 'Nhập tiêu đề' }, { max: 200 }]}
      >
        <Input showCount maxLength={200} placeholder="Vd: Thông báo lịch nghỉ Tết" />
      </Form.Item>
      <Form.Item
        name="body"
        label="Nội dung"
        rules={[{ required: true, message: 'Nhập nội dung' }, { max: 2000 }]}
      >
        <TextArea rows={5} showCount maxLength={2000} placeholder="Nội dung thông báo (text thuần)..." />
      </Form.Item>

      <Form.Item label="Người nhận">
        <Radio.Group
          value={audienceType}
          onChange={(e) => {
            setAudienceType(e.target.value);
            markDirty();
          }}
        >
          <Radio.Button value="USERS">Chọn người nhận</Radio.Button>
          <Radio.Button value="DEPARTMENTS">Theo phòng ban</Radio.Button>
          {canSelectAll && <Radio.Button value="ALL">Toàn bộ nhân viên</Radio.Button>}
        </Radio.Group>
      </Form.Item>

      {audienceType === 'USERS' && (
        <Form.Item name="userIds" rules={[{ required: true, message: 'Chọn ít nhất 1 người nhận' }]}>
          <Select
            mode="multiple"
            showSearch
            allowClear
            loading={usersLoading}
            placeholder="Tìm và chọn nhân viên..."
            optionFilterProp="label"
            maxTagCount="responsive"
            options={userOptions}
          />
        </Form.Item>
      )}
      {audienceType === 'DEPARTMENTS' && (
        <Form.Item
          name="departmentIds"
          rules={[{ required: true, message: 'Chọn ít nhất 1 phòng ban' }]}
        >
          <Select
            mode="multiple"
            showSearch
            allowClear
            loading={deptsLoading}
            placeholder="Chọn phòng ban..."
            optionFilterProp="label"
            options={departmentOptions}
          />
        </Form.Item>
      )}
      {audienceType === 'ALL' && (
        <Text type="secondary">Gửi tới toàn bộ nhân viên đang hoạt động trong hệ thống.</Text>
      )}

      <Space>
        <a onClick={handlePreview} style={{ fontWeight: 500 }}>
          {previewPending ? 'Đang tính...' : 'Xem trước người nhận'}
        </a>
      </Space>

      {previewResult && (
        <Alert
          style={{ marginTop: 12 }}
          type={dirtySincePreview ? 'warning' : 'success'}
          showIcon
          title={
            dirtySincePreview
              ? 'Đã đổi nội dung/người nhận - bấm "Xem trước" lại trước khi gửi'
              : `Sẽ gửi tới ${previewResult.recipientCount} người${
                  previewResult.sample.length
                    ? ` (ví dụ: ${previewResult.sample.join(', ')}${
                        previewResult.recipientCount > previewResult.sample.length ? '…' : ''
                      })`
                    : ''
                }${previewResult.excludedCount ? ` - đã loại ${previewResult.excludedCount} người không hợp lệ` : ''}`
          }
        />
      )}
    </Form>
  );
}
