import { describe, it, expect, beforeEach } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import axiosInstance from './axios-instance';
import { resetRefCacheState, writeRefCacheState } from './ref-cache-version';
import { useAuthStore } from '../stores/auth.store';

async function paramsSent(url: string, extra: Record<string, unknown> = {}) {
  let seen: InternalAxiosRequestConfig | undefined;
  await axiosInstance.get(url, {
    ...extra,
    adapter: async (config: InternalAxiosRequestConfig) => {
      seen = config;
      return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    },
  });
  return seen?.params as Record<string, unknown> | undefined;
}

describe('axios gắn ?v= cho danh mục', () => {
  beforeEach(() => {
    resetRefCacheState();
    writeRefCacheState({ sig: { leave_types: 3 }, epoch: 0 });
    useAuthStore.setState({ user: { id: 7 } as never, accessToken: null, refreshToken: null });
  });

  it('gắn v cho /leave-types', async () => {
    expect((await paramsSent('/leave-types'))?.v).toBe('7.0.0.3');
  });

  it('skipRefVersion=true (trang quản trị cần inUseCount) -> KHÔNG gắn v', async () => {
    expect((await paramsSent('/leave-types', { skipRefVersion: true }))?.v).toBeUndefined();
  });

  it('endpoint không thuộc danh mục -> không gắn v', async () => {
    expect((await paramsSent('/customers'))?.v).toBeUndefined();
  });
});
