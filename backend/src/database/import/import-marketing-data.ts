import { AppDataSource } from '../data-source';
import * as fs from 'fs';
import * as Papa from 'papaparse';
import { Customer } from '../entities/customer.entity';
import { CustomerNote } from '../entities/customer-note.entity';
import { Deposit } from '../entities/deposit.entity';

interface CSVRow {
  ID: string;
  Date: string; // The CSV actually uses "Date" not "Dateinput"
  Name: string;
  Phone: string;
  Mail: string;
  Question: string; // -> customer_notes
  UTMSource: string; // -> source
  UTMCampaign: string;
  Status: string; // 1, 2, 3, 4, 6
  PreBroker: string;
  FTD: string; // -> deposits
  Broker: string;
  DealDate: string; // -> closedDate
  CreateUser: string;
  CreateDate: string;
  Note: string; // -> customers.note
  Account: string;
  Country: string;
  Url: string;
  IsDup: string;
}

async function importMarketingData() {
  const startTime = Date.now();
  try {
    await AppDataSource.initialize();
    console.log('[IMPORT] Database connected');

    const csvFilePath = './src/database/import/marketing_data_export.csv';
    if (!fs.existsSync(csvFilePath)) {
      console.error(`❌ File not found: ${csvFilePath}`);
      process.exit(1);
    }

    // DO NOT prepend header. The file already has one: 
    // ID,Date,Name,Phone,Mail,Question,UTMSource,UTMCampaign,Status,PreBroker,FTD,Broker,DealDate,CreateUser,CreateDate,Note,Account,Country,Url,IsDup
    const csvFile = fs.readFileSync(csvFilePath, 'utf-8');

    const parsed = Papa.parse<CSVRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
    });

    console.log(`[IMPORT] Starting migration of ${parsed.data.length} potential records...`);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let importedCustomers = 0;
    let importedNotes = 0;
    let importedDeposits = 0;
    const ftdSamples: any[] = [];

    try {
      for (let i = 0; i < parsed.data.length; i++) {
        const row = parsed.data[i];
        const rowIndex = i + 2; // +1 for index, +1 for omitted header

        if (!row.Name?.trim()) {
           // Skip completely empty rows or rows without names
           continue; 
        }

        // --- 1. Transform Phone ---
        let phone = row.Phone?.trim();
        if (!phone || phone === 'Chưa xin số' || phone === 'NULL') {
          phone = `MISSING_${rowIndex}`;
        } else if (phone.startsWith('84')) {
          phone = '0' + phone.substring(2);
        }
        
        // Final sanity check for unique constraint (though MISSING_{i} handles most)
        const checkExisting = await queryRunner.manager.findOne(Customer, { where: { phone } });
        if (checkExisting) {
            phone = `MISSING_${rowIndex}_DUP`;
        }

        // --- 2. Map Status ---
        const statusMap: Record<string, string> = {
          '1': 'closed',
          '2': 'potential',
          '3': 'pending',
          '4': 'pending',
          '6': 'pending',
        };
        const status = statusMap[row.Status] || 'pending';

        // --- 3. Map Source ---
        const sourceInput = row.UTMSource?.toLowerCase() || '';
        let source = 'Other';
        if (sourceInput.includes('facebook')) source = 'Facebook';
        else if (sourceInput.includes('tiktok')) source = 'TikTok';
        else if (sourceInput.includes('google')) source = 'Google';
        else if (sourceInput.includes('instagram')) source = 'Instagram';

        // --- 4. Parse Dates ---
        const parseDate = (dateStr: string): Date | null => {
          if (!dateStr || dateStr === 'NULL' || dateStr.trim() === '' || dateStr.includes(':')) return null;
          
          let d: Date;
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/'); // Expected DD/MM/YYYY
            if (parts.length === 3) {
              const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
              const month = parts[1].padStart(2, '0');
              const day = parts[0].padStart(2, '0');
              d = new Date(`${year}-${month}-${day}T00:00:00Z`);
            } else {
              d = new Date(dateStr);
            }
          } else {
            d = new Date(dateStr);
          }

          if (isNaN(d.getTime())) return null;

          const currentYear = new Date().getFullYear();
          if (d.getFullYear() > currentYear + 1 || d.getFullYear() < 2000) {
            d = new Date();
          }
          return d;
        };

        const inputDate = parseDate(row.Date) || new Date();
        const closedDate = status === 'closed' ? (parseDate(row.DealDate) || inputDate) : null;

        // Helper to safely truncate strings
        const truncate = (val: string | undefined, length: number) => {
          if (!val) return undefined;
          return val.length > length ? val.substring(0, length) : val;
        };

        // --- 5. Create Customer ---
        const customer = queryRunner.manager.create(Customer, {
          id: parseInt(row.ID) || (i + 1),
          name: truncate(row.Name?.trim() || 'No Name', 100),
          phone: truncate(phone, 20),
          email: truncate((row.Mail && row.Mail !== 'NULL') ? row.Mail.trim() : undefined, 255),
          source: source as any,
          campaign: truncate(row.UTMCampaign?.trim() || undefined, 100),
          status: status as any,
          broker: truncate(row.Broker?.trim() || undefined, 100),
          closedDate: closedDate || undefined,
          note: (row.Note && row.Note !== 'NULL') ? row.Note.trim() : undefined,
          salesUserId: 1, 
          departmentId: 1, 
          createdById: 1, 
          createdBy_OLD: 1,
          inputDate: inputDate,
          createdAt: inputDate,
        } as any);

        try {
          const savedCustomer = await queryRunner.manager.save(customer);
          importedCustomers++;

          // --- 6. Create Note from "Question" column ---
          if (row.Question?.trim() && row.Question !== '----' && row.Question !== 'NULL') {
            const cNote = queryRunner.manager.create(CustomerNote, {
              customerId: savedCustomer.id,
              note: row.Question.trim(),
              noteType: 'general' as any,
              isImportant: false,
              createdBy: 1,
              createdAt: inputDate,
            });
            await queryRunner.manager.save(cNote);
            importedNotes++;
          }

          // --- 7. Create Deposit if FTD > 0 ---
          const ftdAmount = parseFloat(row.FTD);
          if (!isNaN(ftdAmount) && ftdAmount > 0) {
            const deposit = queryRunner.manager.create(Deposit, {
              customerId: savedCustomer.id,
              amount: ftdAmount,
              depositDate: closedDate || inputDate,
              broker: row.Broker?.trim() || row.PreBroker?.trim() || undefined,
              note: 'FTD từ hệ thống cũ',
              createdById: 1,
              createdBy_OLD: 1,
            } as any);

            const savedDeposit = await queryRunner.manager.save(deposit);
            importedDeposits++;

            if (ftdSamples.length < 3) {
              ftdSamples.push({
                name: savedCustomer.name,
                phone: savedCustomer.phone,
                amount: ftdAmount,
                date: (savedDeposit.depositDate as any).toISOString().split('T')[0],
              });
            }
          }

          if (importedCustomers % 50 === 0) {
            console.log(`[IMPORT] Progress: ${importedCustomers} customers imported...`);
          }
        } catch (err: any) {
          console.error(`❌ Failed to import row ${rowIndex}: "${row.Name}"`);
          console.error(`   Full Row Data: ${JSON.stringify(row)}`);
          console.error(`   Error: ${err.message}`);
          throw err;
        }
      }

      await queryRunner.commitTransaction();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✅ IMPORT SUCCESSFUL (${duration}s):`);
      console.log(`   - Customers: ${importedCustomers}`);
      console.log(`   - Deposits: ${importedDeposits} (FTD > 0)`);
      console.log(`   - Notes: ${importedNotes}`);

      if (ftdSamples.length > 0) {
        console.log('\n📊 SAMPLE DATA (FTD customers):');
        ftdSamples.forEach(s => {
          console.log(`   - ${s.name} | Phone: ${s.phone} | FTD: $${s.amount} | Date: ${s.date}`);
        });
      }

    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Transaction failed, rolled back:', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

  } catch (error) {
    console.error('❌ Critical Error:', error);
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    console.log('\n🎉 Finished.');
    process.exit(0);
  }
}

importMarketingData();
