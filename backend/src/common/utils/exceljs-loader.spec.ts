import { loadExcelJS } from './exceljs-loader';

describe('exceljs-loader', () => {
    it('trả về module exceljs dùng được (Workbook)', () => {
        const { Workbook } = loadExcelJS();
        expect(typeof Workbook).toBe('function');
        expect(new Workbook().addWorksheet('x').name).toBe('x');
    });

    it('gọi nhiều lần trả cùng 1 module (require cache)', () => {
        expect(loadExcelJS()).toBe(loadExcelJS());
    });
});