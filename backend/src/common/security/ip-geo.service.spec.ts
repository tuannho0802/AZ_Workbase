import { BadRequestException } from '@nestjs/common';
import { IpGeoService, isPrivateIp, isValidCountryCode } from './ip-geo.service';
import { getClientCountry } from './client-ip';

describe('getClientCountry (P3.6)', () => {
    it('chuẩn hoá HOA; giá trị lạ/không header -> null', () => {
        expect(getClientCountry({ headers: { 'x-vercel-ip-country': 'vn' } })).toBe('VN');
        for (const v of ['XX', 'T1', 'VNM', '1a']) expect(getClientCountry({ headers: { 'x-vercel-ip-country': v } })).toBeNull();
        expect(getClientCountry({ headers: {} })).toBeNull();
        expect(getClientCountry({})).toBeNull();
    });
});

describe('isPrivateIp / isValidCountryCode', () => {
    it.each(['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.5', '127.0.0.1', '::1', 'fc00::1', 'fe80::1'])('%s nội bộ', (ip) => expect(isPrivateIp(ip)).toBe(true));
    it.each(['8.8.8.8', '172.32.0.1', '113.161.1.1', '2001:db8::1', 'abc', null])('%s KHÔNG nội bộ', (ip) => expect(isPrivateIp(ip as any)).toBe(false));
    it('mã quốc gia', () => {
        expect(isValidCountryCode('VN')).toBe(true);
        expect(isValidCountryCode('US')).toBe(true);
        for (const c of ['ZZ', 'XK', 'AA', 'vn', 'VNM', undefined]) expect(isValidCountryCode(c)).toBe(false);
    });
});

describe('IpGeoService (P3.6)', () => {
    let repo: { query: jest.Mock };
    let svc: IpGeoService;
    beforeEach(() => { repo = { query: jest.fn().mockResolvedValue([]) }; svc = new IpGeoService(repo as any); });

    it('record: dòng manual KHÔNG bị header ghi đè (điều kiện trong SQL)', async () => {
        await svc.record('8.8.8.8', 'US');
        const sql: string = repo.query.mock.calls[0][0];
        expect(sql).toContain("country_code = IF(source = 'manual', country_code, VALUES(country_code))");
        expect(sql).toContain("source = IF(source = 'manual', source, 'vercel')");
    });
    it('record: không header -> không ghi; IP nội bộ -> source private; lỗi DB bị nuốt', async () => {
        await svc.record('8.8.8.8', null);
        expect(repo.query).not.toHaveBeenCalled();
        await svc.record('192.168.1.2', 'VN');
        expect(repo.query.mock.calls[0][0]).toContain("'private'");
        repo.query.mockRejectedValue(new Error('boom'));
        await expect(svc.record('8.8.8.8', 'US')).resolves.toBeUndefined();
    });
    it('resolveMany: 1 query IN, loại trùng; IP nội bộ -> private, không quốc gia', async () => {
        repo.query.mockResolvedValue([{ ip: '8.8.8.8', country_code: 'US', source: 'manual', updated_by_name: 'Admin A' }]);
        const m = await svc.resolveMany(['8.8.8.8', '8.8.8.8', '10.0.0.1', null, 'rác!']);
        expect(repo.query).toHaveBeenCalledTimes(1);
        expect(repo.query.mock.calls[0][1]).toEqual(['8.8.8.8', '10.0.0.1']);
        expect(m.get('8.8.8.8')).toMatchObject({ countryCode: 'US', ipKind: 'public', source: 'manual', updatedByName: 'Admin A' });
        expect(m.get('10.0.0.1')).toMatchObject({ countryCode: null, ipKind: 'private' });
    });
    it('setManual: sai mã/IP nội bộ/IP sai -> 400; hợp lệ -> ghi manual + giá trị cũ', async () => {
        await expect(svc.setManual('8.8.8.8', 'ZZ', 1)).rejects.toThrow(BadRequestException);
        await expect(svc.setManual('192.168.1.1', 'VN', 1)).rejects.toThrow(BadRequestException);
        await expect(svc.setManual('rác', 'VN', 1)).rejects.toThrow(BadRequestException);
        repo.query.mockResolvedValueOnce([{ country_code: 'US' }]).mockResolvedValueOnce(undefined);
        await expect(svc.setManual('8.8.8.8', 'vn', 7)).resolves.toEqual({ ip: '8.8.8.8', before: 'US', after: 'VN' });
        expect(repo.query.mock.calls.at(-1)![1]).toEqual(['8.8.8.8', 'VN', 7]);
    });
    it('clearManual: chỉ xoá source=manual; không có -> null', async () => {
        await expect(svc.clearManual('8.8.8.8')).resolves.toBeNull();
        repo.query.mockResolvedValueOnce([{ country_code: 'VN' }]).mockResolvedValueOnce(undefined);
        await expect(svc.clearManual('8.8.8.8')).resolves.toEqual({ ip: '8.8.8.8', before: 'VN' });
        expect(repo.query.mock.calls.at(-1)![0]).toContain("source = 'manual'");
    });
});
