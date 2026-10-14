import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn() }));
vi.mock('./axios-instance', () => ({ default: axiosMock }));

import { sessionsApi } from './sessions.api';

describe('sessionsApi (PLAN P5)', () => {
  beforeEach(() => {
    axiosMock.get.mockReset().mockResolvedValue({ data: { ok: 1 } });
    axiosMock.delete.mockReset().mockResolvedValue({ data: { success: true, removed: 1 } });
  });

  it('thiết bị của mình: đúng endpoint /auth/sessions', async () => {
    await sessionsApi.listMine();
    expect(axiosMock.get).toHaveBeenCalledWith('/auth/sessions');
    await sessionsApi.revokeMine('abc123');
    expect(axiosMock.delete).toHaveBeenCalledWith('/auth/sessions/abc123');
    await sessionsApi.revokeMyOthers();
    expect(axiosMock.delete).toHaveBeenLastCalledWith('/auth/sessions');
  });

  it('admin: /users/:id/sessions (1 phiên hoặc tất cả)', async () => {
    await sessionsApi.listOfUser(20);
    expect(axiosMock.get).toHaveBeenCalledWith('/users/20/sessions');
    await sessionsApi.revokeOfUser(20, 'abc123');
    expect(axiosMock.delete).toHaveBeenCalledWith('/users/20/sessions/abc123');
    await sessionsApi.revokeAllOfUser(20);
    expect(axiosMock.delete).toHaveBeenLastCalledWith('/users/20/sessions');
  });

  it('sid được encode để không phá URL', async () => {
    await sessionsApi.revokeMine('a/b?c');
    expect(axiosMock.delete).toHaveBeenCalledWith('/auth/sessions/a%2Fb%3Fc');
  });
});
