'use client';

import { Form, Input, Radio, Select, Alert, Avatar, Space, Tag, Typography } from 'antd';
import type { BroadcastComposeState, UserOption } from '@/lib/hooks/useBroadcastCompose';
import type { Department } from '@/lib/api/departments.api';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';

const { TextArea } = Input;
const { Text } = Typography;

const OPTION_TAG_STYLE = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };

/**
 * renderUserOption/renderDepartmentOption - mirror ĐÚNG pattern Tag màu
 * (Avatar + Tag vai trò/phòng ban/vị trí) đã dùng ở CustomerFilters.tsx/
 * cong-viec-dinh-ky/page.tsx, thay cho dropdown "Chọn người nhận"/"Theo
 * phòng ban" hiện tên trơn (báo qua ảnh chụp 2026-09-22).
 */
function useOptionRenders() {
  const { getRoleColor } = useRoleColorMap();
  const { roleColors } = useRoleColors();
  const roleNameMap = new Map(roleColors.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  const renderUserOption = (option: { data: { user: UserOption } }) => {
    const u = option.data.user;
    return (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name}</span>
        {u.role && <Tag style={OPTION_TAG_STYLE} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>}
        {u.department?.name && (
          <Tag style={OPTION_TAG_STYLE} color={resolveEntityColor(u.department.color)}>
            {u.department.name}
          </Tag>
        )}
        {u.position?.name && (
          <Tag style={OPTION_TAG_STYLE} color={resolveEntityColor(u.position.color)}>
            {u.position.name}
          </Tag>
        )}
      </Space>
    );
  };

  const renderDepartmentOption = (option: { data: { department: Department } }) => {
    const d = option.data.department;
    return (
      <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>
        {d.name}
      </Tag>
    );
  };

  return { renderUserOption, renderDepartmentOption };
}

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
  const { renderUserOption, renderDepartmentOption } = useOptionRenders();

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
            optionRender={renderUserOption}
            popupMatchSelectWidth={false}
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
            optionRender={renderDepartmentOption}
            popupMatchSelectWidth={false}
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