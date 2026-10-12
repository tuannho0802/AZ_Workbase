import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { STORAGE_DEMOS } from './storage.demos';

const demo = (id: string) => STORAGE_DEMOS.find((d) => d.id === id)!;
const has = (c: HTMLElement, t: string) => (c.textContent ?? '').includes(t);

describe('mẫu Quản lý lưu trữ ảnh: đăng ký + render', () => {
    it('3 mẫu có trong GUIDE_DEMOS', () => {
        expect(STORAGE_DEMOS.map((d) => d.id)).toEqual(['storage-usage', 'storage-tabs', 'storage-cleanup']);
        for (const d of STORAGE_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('storage-usage: manage có Tính lại ngay + Đổi hạn mức mềm; view không có', () => {
        const m = render(<>{demo('storage-usage').render({ viewer: 'manage' })}</>);
        expect(has(m.container, 'Tính lại ngay')).toBe(true);
        expect(has(m.container, 'Đổi hạn mức mềm')).toBe(true);
        expect(has(m.container, 'Thư viện ảnh chung')).toBe(true);
        m.unmount();
        const v = render(<>{demo('storage-usage').render({ viewer: 'view' })}</>);
        expect(has(v.container, 'Tính lại ngay')).toBe(false);
        expect(has(v.container, 'Đổi hạn mức mềm')).toBe(false);
    });

    it('storage-tabs: chỉ manage có tab Dọn dẹp Media', () => {
        const m = render(<>{demo('storage-tabs').render({ viewer: 'manage' })}</>);
        expect(has(m.container, 'Dọn dẹp Media')).toBe(true);
        m.unmount();
        const v = render(<>{demo('storage-tabs').render({ viewer: 'view' })}</>);
        expect(has(v.container, 'Dọn dẹp Media')).toBe(false);
        expect(has(v.container, 'Avatar nhân viên')).toBe(true);
    });

    it('storage-cleanup: có cảnh báo và nút Xoá đã chọn', () => {
        const c = render(<>{demo('storage-cleanup').render({})}</>);
        expect(has(c.container, 'Xoá đã chọn (1)')).toBe(true);
        expect(has(c.container, 'trước khi xoá file thật trên B2')).toBe(true);
    });
});
