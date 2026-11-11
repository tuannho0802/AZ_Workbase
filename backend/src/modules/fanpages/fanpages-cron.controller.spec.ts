import { HttpException } from '@nestjs/common';
import { FanpagesCronController } from './fanpages-cron.controller';

describe('FanpagesCronController', () => {
    const OLD = process.env.CRON_SECRET;
    const result = { nowVnHour: 18, todayVn: '2026-11-11', pastCutoff: true, dryRun: false, candidatesChecked: 0, silentPageIds: [], atRiskPageIds: [] };
    let reminders: { runDueReminders: jest.Mock };
    let controller: FanpagesCronController;

    beforeEach(() => {
        process.env.CRON_SECRET = 's3cret';
        reminders = { runDueReminders: jest.fn().mockResolvedValue(result) };
        controller = new FanpagesCronController(reminders as any);
    });
    afterEach(() => {
        if (OLD === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = OLD;
    });

    it('thiếu CRON_SECRET trên server -> 503', async () => {
        delete process.env.CRON_SECRET;
        await expect(controller.runReminders('x')).rejects.toMatchObject({ status: 503 });
    });
    it('secret sai / thiếu -> 401 và không chạy nhắc', async () => {
        await expect(controller.runReminders('sai')).rejects.toBeInstanceOf(HttpException);
        await expect(controller.runReminders()).rejects.toMatchObject({ status: 401 });
        expect(reminders.runDueReminders).not.toHaveBeenCalled();
    });
    it('secret đúng qua query / header / Bearer -> chạy', async () => {
        await controller.runReminders('s3cret');
        await controller.runReminders(undefined, undefined, 's3cret');
        await controller.runReminders(undefined, undefined, undefined, 'Bearer s3cret');
        expect(reminders.runDueReminders).toHaveBeenCalledTimes(3);
    });
    it('dryRun=true được truyền xuống', async () => {
        await controller.runReminders('s3cret', 'true');
        expect(reminders.runDueReminders).toHaveBeenCalledWith({ dryRun: true });
    });
});