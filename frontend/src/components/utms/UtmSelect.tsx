'use client';

import { useMemo, useState } from 'react';
import { App, Button, Divider, Select, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useCreateUtm, useRecentUtms, useUsableUtms } from '@/lib/hooks/useUtms';
import type { UtmBrief } from '@/lib/api/utms.api';
import { toastApiError } from '@/lib/utils/error-message.util';
import { UtmTag } from './UtmTag';

const { Text } = Typography;

/** So sánh tên "gần giống" ở FE chỉ để ẩn nút Tạo khi đã có đúng tên đó; BE mới là nơi chốt UNIQUE. */
export const normalizeUtmName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

interface Props {
  value?: number | null;
  onChange?: (utmId: number | null) => void;
  /** UTM hiện tại của khách (có thể đang khoá / riêng tư nên KHÔNG nằm trong danh sách được dùng). */
  fallback?: UtmBrief | null;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Dropdown chọn UTM (thay ô nhập tay). Tìm kiếm phía server, nhóm "Dùng gần đây", và "＋ Tạo UTM mới"
 * ngay trong dropdown khi có `utms.create` (Employee thường không có → không thấy nút, tránh 400).
 */
export function UtmSelect({ value, onChange, fallback, disabled, placeholder = 'Chọn UTM...' }: Props) {
  const { message } = App.useApp();
  const { can } = useMyPermissions();
  const canCreate = can('utms.create');

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const query = debounced.trim();

  const { utms, isFetching } = useUsableUtms(query || undefined, open);
  const { recent } = useRecentUtms(open && !query);
  const createMutation = useCreateUtm();
  // Nhớ UTM vừa chọn/tạo để nhãn hiển thị đúng ngay cả khi danh sách tìm kiếm đã đổi.
  const [picked, setPicked] = useState<UtmBrief | null>(null);

  const options = useMemo(() => {
    const toOpt = (u: UtmBrief) => ({ value: u.id, label: <UtmTag name={u.name} color={u.color} /> });
    const recentIds = new Set(recent.map((r) => r.id));
    const rest = utms.filter((u) => !recentIds.has(u.id));

    // UTM đang chọn nhưng không nằm trong danh sách (khoá/riêng tư/đã lọc) → vẫn phải hiện nhãn đúng.
    const known = new Set<number>([...recent.map((r) => r.id), ...utms.map((u) => u.id)]);
    const extra: UtmBrief[] = [];
    if (value != null && !known.has(value)) {
      const sel = picked?.id === value ? picked : fallback?.id === value ? fallback : null;
      if (sel) extra.push(sel);
    }

    if (!query && recent.length > 0) {
      return [
        ...extra.map(toOpt),
        { label: <Text type="secondary">Dùng gần đây</Text>, options: recent.map(toOpt) },
        { label: <Text type="secondary">Tất cả UTM</Text>, options: rest.map(toOpt) },
      ];
    }
    return [...extra.map(toOpt), ...utms.map(toOpt)];
  }, [utms, recent, query, value, picked, fallback]);

  const exactExists = useMemo(() => {
    const key = normalizeUtmName(query);
    return utms.some((u) => normalizeUtmName(u.name) === key);
  }, [utms, query]);
  const showCreate = canCreate && query.length > 0 && !exactExists && !isFetching;

  const handleCreate = () => {
    createMutation.mutate(
      { name: query },
      {
        onSuccess: (created) => {
          setPicked({ id: created.id, name: created.name, color: created.color });
          onChange?.(created.id);
          setOpen(false);
          setSearch('');
          message.success(`Đã tạo UTM "${created.name}"`);
        },
        onError: (err) => toastApiError(message, err, 'Tạo UTM thất bại'),
      },
    );
  };

  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      placeholder={placeholder}
      value={value ?? undefined}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
      onSearch={setSearch}
      searchValue={search}
      filterOption={false} // lọc phía server
      loading={open && isFetching}
      options={options}
      onSelect={(id: number) => {
        const found = [...utms, ...recent].find((u) => u.id === id);
        if (found) setPicked({ id: found.id, name: found.name, color: found.color });
      }}
      onChange={(id) => onChange?.(id == null ? null : (id as number))}
      notFoundContent={
        <Text type="secondary" style={{ padding: '4px 8px' }}>
          {query ? 'Không thấy UTM khớp' : 'Chưa có UTM nào'}
        </Text>
      }
      popupRender={(menu) => (
        <>
          {menu}
          {showCreate && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <Button
                type="link"
                icon={<PlusOutlined />}
                loading={createMutation.isPending}
                onClick={handleCreate}
                style={{ width: '100%', textAlign: 'left' }}
              >
                Tạo UTM mới &quot;{query}&quot;
              </Button>
            </>
          )}
        </>
      )}
    />
  );
}
