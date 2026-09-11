'use client';

import { useEffect, useMemo, useState } from 'react';
import { Drawer, Select, Switch, Typography, Spin, Empty, Button, Space, App, Alert, Divider, Tag } from 'antd';
import { UndoOutlined, SaveOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useRoles } from '@/lib/hooks/useRoles';
import { useRoleUiVisibilityRules, useUpsertUiVisibilityRules, useDeleteUiVisibilityRules } from '@/lib/hooks/useUiVisibility';
import { Position } from '@/lib/api/positions.api';

const { Text, Paragraph } = Typography;

// Resource DUY NHẤT hiện có ở BE (xem UI_VISIBILITY_RESOURCES) - hardcode ở
// đây thay vì gọi thêm API danh mục vì chỉ có 1 giá trị.
const RESOURCE = 'customers';

// Nhãn tiếng Việt cho từng element_key - PHẢI khớp đúng `CUSTOMER_ELEMENT_KEYS`
// ở backend/src/modules/ui-visibility/ui-visibility.constants.ts. Key lạ
// (nếu BE thêm mới mà FE quên cập nhật) vẫn hiển thị bằng raw key, không vỡ UI.
const ELEMENT_KEY_LABELS: Record<string, { label: string; group: 'field' | 'tab'; hint?: string }> = {
  'field:sales_assignment': {
    label: 'Sales phụ trách (chính + phụ)',
    group: 'field',
    hint: 'Cột "Sales phụ trách" ở bảng khách hàng + filter theo Sales',
  },
  'field:marketing_assignment': {
    label: 'Marketing phụ trách',
    group: 'field',
    hint: 'Cột "Marketing phụ trách" ở bảng khách hàng + filter theo Marketing',
  },
  'field:assigned_date': {
    label: 'Ngày nhận khách',
    group: 'field',
  },
  'field:closed_date': {
    label: 'Ngày chốt khách',
    group: 'field',
  },
  'tab:deposits': {
    label: 'Tab "Lịch sử nạp tiền (FTD)"',
    group: 'tab',
    hint: 'Trong màn Chi tiết khách hàng',
  },
  'tab:assignments': {
    label: 'Tab "Phân công"',
    group: 'tab',
    hint: 'Trong màn Chi tiết khách hàng',
  },
  'tab:groups': {
    label: 'Tab "Nhóm khách hàng"',
    group: 'tab',
    hint: 'Trong màn Chi tiết khách hàng',
  },
};

interface Props {
  position: Position | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Drawer cấu hình "ẩn/hiện" field + tab của module Khách hàng cho ĐÚNG 1
 * Vị trí (scope = positionId, ưu tiên cao nhất trong 3 tầng Position >
 * Department > Global - xem UiVisibilityService). Phải chọn Role trước vì
 * rule luôn gắn với 1 Role cụ thể (giống Action Permission) - 1 Vị trí có
 * thể có nhiều Role khác nhau mang vị trí đó, mỗi Role cấu hình riêng.
 *
 * Editor MỞ RA đúng trạng thái HIỆU LỰC (đã merge Toàn cục + override Vị
 * trí này, nếu có) - giống nguyên tắc `mergeGlobalWithOverride` ở
 * DepartmentOverridesPanel/PositionOverridesPanel (Action Permission), áp
 * dụng lại cho trục UI Visibility.
 */
export function PositionVisibilityDrawer({ position, open, onClose }: Props) {
  const { message } = App.useApp();
  // ⚠️ FIX BUG THẬT (403 "GET /api/roles" vô nghĩa ở trang "Vị trí" cho
  // Manager): Drawer này LUÔN được mount sẵn trong `vi-tri/page.tsx` (ẩn/hiện
  // qua prop `open`, không unmount), nên nếu gọi `useRoles()` không điều
  // kiện thì GET /roles bắn ngay lúc trang "Vị trí" render - BẤT KỂ Drawer
  // đang mở hay không, và bất kể người xem trang (Manager) có `roles.view`
  // hay không. Nút mở Drawer này vốn dĩ CHỈ hiện với người có `roles.manage`
  // (xem `canManageVisibility` ở page.tsx) - Manager không bao giờ bấm được
  // nút đó nên không bao giờ cần gọi API này. Truyền `enabled: open` để chỉ
  // fetch đúng lúc Drawer thật sự được mở ra.
  const { roles, isLoading: loadingRoles } = useRoles(open);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);

  // Reset lựa chọn Role mỗi khi đổi Vị trí đang xem/mở lại Drawer - tránh
  // giữ nhầm state Role của lần mở trước.
  useEffect(() => {
    if (open) setSelectedRoleId(null);
  }, [open, position?.id]);

  const { rules, isLoading: loadingRules } = useRoleUiVisibilityRules(
    selectedRoleId ?? undefined,
    RESOURCE,
  );
  const upsertMutation = useUpsertUiVisibilityRules(selectedRoleId ?? 0, RESOURCE);
  const deleteMutation = useDeleteUiVisibilityRules(selectedRoleId ?? 0, RESOURCE);

  // Trạng thái hiệu lực HIỆN TẠI (đã merge Global -> Position override của
  // đúng vị trí đang xem) - key = elementKey, value = visible.
  const effectiveState = useMemo(() => {
    if (!rules || !position) return null;
    const map = new Map<string, boolean>();
    for (const key of rules.elementKeys) map.set(key, true); // mặc định hiện
    for (const r of rules.global) map.set(r.elementKey, r.visible);
    const posOverride = rules.positionOverrides.find((o) => o.positionId === position.id);
    for (const r of posOverride?.rules ?? []) map.set(r.elementKey, r.visible);
    return { map, hasOverride: !!posOverride };
  }, [rules, position]);

  // State đang chỉnh trong Drawer (khởi tạo lại từ effectiveState mỗi khi đổi).
  const [draft, setDraft] = useState<Map<string, boolean> | null>(null);
  useEffect(() => {
    setDraft(effectiveState ? new Map(effectiveState.map) : null);
  }, [effectiveState]);

  const isDirty = useMemo(() => {
    if (!draft || !effectiveState) return false;
    for (const [k, v] of draft) {
      if (effectiveState.map.get(k) !== v) return true;
    }
    return false;
  }, [draft, effectiveState]);

  const handleSave = () => {
    if (!draft || !position || !selectedRoleId || !rules) return;
    const payload = {
      resource: RESOURCE,
      positionId: position.id,
      rules: rules.elementKeys.map((key) => ({
        elementKey: key,
        visible: draft.get(key) ?? true,
      })),
    };
    upsertMutation.mutate(payload, {
      onSuccess: () => message.success(`Đã lưu cấu hình hiển thị cho Vị trí "${position.name}"`),
      onError: (err: any) => message.error(err?.response?.data?.message || 'Lưu thất bại'),
    });
  };

  const handleReset = () => {
    if (!position || !selectedRoleId) return;
    deleteMutation.mutate(
      { positionId: position.id },
      {
        onSuccess: () =>
          message.success(`Đã gỡ cấu hình riêng - Vị trí "${position.name}" quay lại dùng ma trận Toàn cục/Phòng ban`),
        onError: (err: any) => message.error(err?.response?.data?.message || 'Gỡ cấu hình thất bại'),
      },
    );
  };

  const fieldKeys = rules?.elementKeys.filter((k) => ELEMENT_KEY_LABELS[k]?.group !== 'tab') ?? [];
  const tabKeys = rules?.elementKeys.filter((k) => ELEMENT_KEY_LABELS[k]?.group === 'tab') ?? [];

  const renderRow = (key: string) => {
    const meta = ELEMENT_KEY_LABELS[key] ?? { label: key, group: 'field' as const };
    const visible = draft?.get(key) ?? true;
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div>
          <Text>{meta.label}</Text>
          {meta.hint && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{meta.hint}</Text>
            </div>
          )}
        </div>
        <Switch
          checked={visible}
          checkedChildren="Hiện"
          unCheckedChildren="Ẩn"
          onChange={(checked) => {
            setDraft((prev) => {
              const next = new Map(prev ?? []);
              next.set(key, checked);
              return next;
            });
          }}
        />
      </div>
    );
  };

  return (
    <Drawer
      title={`Cấu hình hiển thị dữ liệu - Vị trí "${position?.name ?? ''}"`}
      open={open}
      onClose={onClose}
      size={480}
      extra={
        selectedRoleId && (
          <Space>
            {effectiveState?.hasOverride && (
              <Button
                icon={<UndoOutlined />}
                loading={deleteMutation.isPending}
                onClick={handleReset}
              >
                Gỡ override
              </Button>
            )}
            <Button
              type="primary"
              icon={<SaveOutlined />}
              disabled={!isDirty}
              loading={upsertMutation.isPending}
              onClick={handleSave}
            >
              Lưu
            </Button>
          </Space>
        )
      }
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Ẩn/hiện field và tab của module <Text code>Khách hàng</Text> RIÊNG cho Vị trí này - áp dụng cho
        MỌI nhân viên đang mang Vị trí <Text strong>{position?.name}</Text>, bất kể phòng ban. BE sẽ
        thực sự XOÁ field bị ẩn khỏi response API (không phải chỉ ẩn ở giao diện) - filter liên quan trên
        thanh lọc bảng khách hàng cũng tự ẩn theo. Cần chọn 1 Role trước vì mỗi Role cấu hình riêng.
      </Paragraph>

      <Select
        placeholder="Chọn Role để xem/sửa cấu hình..."
        style={{ width: '100%', marginBottom: 16 }}
        loading={loadingRoles}
        value={selectedRoleId}
        onChange={(v) => setSelectedRoleId(v)}
        // ⚠️ ĐỔI (isRootAdmin) - TRƯỚC ĐÂY lọc bỏ role 'admin' khỏi dropdown
        // vì lúc đó BE (`UiVisibilityService.getHiddenElementKeys()`) bypass
        // cứng cho MỌI `role === 'admin'` - cấu hình ẩn field cho Admin lúc
        // đó Lưu xong không có tác dụng gì (BE luôn trả rỗng), để Admin
        // trong dropdown sẽ gây hiểu nhầm.
        //
        // Giờ BE đã đổi điều kiện bypass thành CHỈ Root Admin
        // (`roleCode === Role.ADMIN && isRootAdmin === true` - xem JSDoc
        // `getHiddenElementKeys()`). Admin THƯỜNG (`role=admin` nhưng
        // `isRootAdmin=false`) đi qua đúng luồng `loadHiddenKeysMap()` như
        // mọi role khác - CÓ THỂ bị Root Admin ẩn field/tab qua màn hình
        // này. Vì vậy không còn lý do lọc bỏ 'admin' khỏi danh sách nữa -
        // Root Admin vẫn luôn thấy mọi thứ (bypass ở tầng BE, không phụ
        // thuộc màn hình này) nên tự cấu hình 1 rule cho role 'admin' không
        // "tự khoá mắt chính mình" của Root Admin.
        options={roles.map((r) => ({ value: r.id, label: r.name }))}
        showSearch={{ optionFilterProp: 'label' }}
      />

      {!selectedRoleId ? (
        <Empty description="Chọn 1 Role ở trên để xem/sửa cấu hình hiển thị" />
      ) : loadingRules || !draft ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : (
        <>
          {effectiveState?.hasOverride && (
            <Alert
              type="info"
              showIcon
              icon={<EyeInvisibleOutlined />}
              style={{ marginBottom: 12 }}
                  title="Vị trí này đang có cấu hình riêng"
              description="Khác với ma trận Toàn cục/Phòng ban - bấm &quot;Gỡ override&quot; để quay lại dùng chung."
            />
          )}

          <Divider titlePlacement="left" plain style={{ margin: '8px 0' }}>
            <Tag>Cột dữ liệu</Tag>
          </Divider>
          {fieldKeys.map(renderRow)}

          <Divider titlePlacement="left" plain style={{ margin: '16px 0 8px' }}>
            <Tag>Tab trong chi tiết khách hàng</Tag>
          </Divider>
          {tabKeys.map(renderRow)}
        </>
      )}
    </Drawer>
  );
}