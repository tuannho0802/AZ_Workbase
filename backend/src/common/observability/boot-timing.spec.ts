import { bootMark, bootStep, formatBootTiming, isBootTimingEnabled } from './boot-timing';

describe('boot-timing', () => {
    const OLD = process.env.CPU_TIMING;
    afterEach(() => {
        if (OLD === undefined) delete process.env.CPU_TIMING;
        else process.env.CPU_TIMING = OLD;
    });

    it('chỉ bật khi CPU_TIMING=true', () => {
        delete process.env.CPU_TIMING;
        expect(isBootTimingEnabled()).toBe(false);
        process.env.CPU_TIMING = 'false';
        expect(isBootTimingEnabled()).toBe(false);
        process.env.CPU_TIMING = 'true';
        expect(isBootTimingEnabled()).toBe(true);
    });

    it('bootStep trả cpu và wall không âm', async () => {
        const m = bootMark();
        await new Promise((r) => setTimeout(r, 20));
        const s = bootStep(m);
        expect(s.cpuMs).toBeGreaterThanOrEqual(0);
        expect(s.wallMs).toBeGreaterThanOrEqual(15);
    });

    it('formatBootTiming ra đúng 1 dòng theo định dạng', () => {
        const line = formatBootTiming(812.4, { cpuMs: 300.2, wallMs: 1500.7 }, { cpuMs: 40.1, wallMs: 55.9 }, 1620.3);
        expect(line).toBe('load cpu=812ms | create cpu=300ms wall=1501ms | init cpu=40ms wall=56ms | total wall=1620ms');
        expect(line).not.toContain('\n');
    });
});