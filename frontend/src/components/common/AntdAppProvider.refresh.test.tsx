import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AntdAppProvider, refreshMyPermissions } from './AntdAppProvider';

const clients: QueryClient[] = [];
function Grab() {
    const qc = useQueryClient();
    useEffect(() => {
        clients.push(qc);
    }, [qc]);
    return null;
}

describe('refreshMyPermissions', () => {
    it('invalidate quyền + ẩn/hiện UI; tối đa 1 lần / 5 giây', () => {
        render(
            <AntdAppProvider>
                <Grab />
            </AntdAppProvider>,
        );
        const spy = vi.spyOn(clients[0], 'invalidateQueries');
        const t0 = 1_000_000;
        expect(refreshMyPermissions(t0)).toBe(true);
        expect(spy).toHaveBeenCalledWith({ queryKey: ['my-permissions'] });
        expect(spy).toHaveBeenCalledWith({ queryKey: ['ui-visibility-my-hidden'] });
        spy.mockClear();
        expect(refreshMyPermissions(t0 + 1000)).toBe(false); // trong 5s: bỏ qua
        expect(spy).not.toHaveBeenCalled();
        expect(refreshMyPermissions(t0 + 6000)).toBe(true);
    });
});
