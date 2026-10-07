/** Tạo JWT giả (chữ ký không được kiểm tra ở FE). */
export function makeJwt(expSeconds: number | undefined, extra: Record<string, unknown> = {}): string {
  const b64u = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: 5, ...(expSeconds !== undefined ? { exp: expSeconds } : {}), ...extra })}.sig`;
}
