import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUIDE_DEMOS } from '../guide-demos';
import { PROFILE_DEMOS } from './profile.demos';

const demo = (id: string) => PROFILE_DEMOS.find((d) => d.id === id)!;

describe('mẫu Profile: đăng ký + render', () => {
    it('4 mẫu có trong GUIDE_DEMOS', () => {
        expect(PROFILE_DEMOS.map((d) => d.id)).toEqual(['profile-card', 'profile-edit', 'profile-groups', 'profile-actions']);
        for (const d of PROFILE_DEMOS) expect(GUIDE_DEMOS.some((x) => x.id === d.id)).toBe(true);
    });

    it('profile-edit: employee bị khoá Email (nhãn không có quyền sửa), admin thì không', () => {
        const emp = render(<>{demo('profile-edit').render({ viewer: 'employee' })}</>);
        expect(screen.getByText('Email (không có quyền sửa)')).toBeTruthy();
        expect(emp.container.querySelector('input[disabled]')).not.toBeNull();
        emp.unmount();
        const adm = render(<>{demo('profile-edit').render({ viewer: 'admin' })}</>);
        expect(screen.queryByText('Email (không có quyền sửa)')).toBeNull();
        expect(adm.container.querySelector('input[disabled]')).toBeNull();
    });

    it('profile-card: có nút Chỉnh sửa + Đổi mật khẩu, thẻ vai trò đúng theo viewer', () => {
        const emp = render(<>{demo('profile-card').render({ viewer: 'employee' })}</>);
        expect(screen.getByText('Chỉnh sửa')).toBeTruthy();
        expect(screen.getByText('Đổi mật khẩu')).toBeTruthy();
        expect(screen.getByText('EMPLOYEE')).toBeTruthy();
        emp.unmount();
        render(<>{demo('profile-card').render({ viewer: 'admin' })}</>);
        expect(screen.getByText('ADMIN')).toBeTruthy();
    });

    it('profile-groups: có cả Quản lý chính và Quản lý phụ', () => {
        render(<>{demo('profile-groups').render({})}</>);
        expect(screen.getByText('Quản lý chính')).toBeTruthy();
        expect(screen.getByText('Quản lý phụ')).toBeTruthy();
    });
});
