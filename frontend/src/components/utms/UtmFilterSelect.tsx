'use client';

import { useMemo, useState } from 'react';
import { Select } from 'antd';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useUsableUtms } from '@/lib/hooks/useUtms';
import type { UtmBrief } from '@/lib/api/utms.api';
import { UtmTag } from './UtmTag';

interface Props {
  value?: number;
  onChange: (utmId: number | undefined) => void;
  placeholder?: string;
}

/**
 * Ô lọc theo UTM (bảng khách hàng). Khác `UtmSelect`: KHÔNG có "Tạo mới", và liệt kê cả UTM đang khoá
 * (khách cũ vẫn dùng) để lọc được. Tìm kiếm phía server nên không vướng giới hạn 50 dòng.
 */
export function UtmFilterSelect({ value, onChange, placeholder = 'Chọn UTM' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 250).trim();
  const { utms, isFetching } = useUsableUtms(q || undefined, open || value != null, false);
  const [picked, setPicked] = useState<UtmBrief | null>(null);

  const options = useMemo(() => {
    const list: UtmBrief[] = utms.map((u) => ({ id: u.id, name: u.name, color: u.color }));
    if (value != null && !list.some((u) => u.id === value) && picked?.id === value) list.unshift(picked);
    return list.map((u) => ({ value: u.id, label: <UtmTag name={u.name} color={u.color} /> }));
  }, [utms, value, picked]);

  return (
    <Select
      showSearch
      allowClear
      placeholder={placeholder}
      style={{ width: '100%' }}
      value={value}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
      searchValue={search}
      onSearch={setSearch}
      filterOption={false}
      loading={open && isFetching}
      popupMatchSelectWidth={false}
      options={options}
      onSelect={(id: number) => {
        const found = utms.find((u) => u.id === id);
        if (found) setPicked({ id: found.id, name: found.name, color: found.color });
      }}
      onChange={(id) => onChange(id ?? undefined)}
    />
  );
}
