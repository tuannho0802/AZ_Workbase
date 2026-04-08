import * as fs from 'fs';
import * as Papa from 'papaparse';

const csvFilePath = './src/database/import/marketing_data_export.csv';
const csvFile = fs.readFileSync(csvFilePath, 'utf-8');

const parsed = Papa.parse(csvFile, {
  header: true,
  skipEmptyLines: true,
});

const parseDate = (dateStr: string): Date | null => {
  if (!dateStr || dateStr === 'NULL' || dateStr.trim() === '' || dateStr.includes(':')) return null;
  
  let d: Date;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const year = parts[2].trim().length === 2 ? `20${parts[2].trim()}` : parts[2].trim();
      const month = parts[1].trim().padStart(2, '0');
      const day = parts[0].trim().padStart(2, '0');
      d = new Date(`${year}-${month}-${day}T00:00:00Z`);
    } else {
      d = new Date(dateStr);
    }
  } else {
    d = new Date(dateStr);
  }
  return isNaN(d.getTime()) ? null : d;
};

for (let i = 0; i < parsed.data.length; i++) {
  const row: any = parsed.data[i];
  const inputDate = parseDate(row.Date);
  if (inputDate && inputDate.getFullYear() < 2000) {
    console.log(`Row ${i + 2}: Date='${row.Date}', ParsedYear=${inputDate.getFullYear()}, Row=${JSON.stringify(row)}`);
  }
}

console.log('Scan complete.');
