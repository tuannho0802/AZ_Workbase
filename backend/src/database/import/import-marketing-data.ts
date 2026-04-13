import { AppDataSource } from '../data-source';
import * as fs from 'fs';
import * as Papa from 'papaparse';
import { Customer } from '../entities/customer.entity';
import { CustomerNote } from '../entities/customer-note.entity';
import { Deposit } from '../entities/deposit.entity';

// ==========================================
// CONFIGURATION & TYPES
// ==========================================
interface CSVRow {
  ID: string;
  Date: string;
  Dateinput?: string; 
  Name: string;
  Phone: string;
  Mail: string;
  Question: string;
  UTMSource: string;
  UTMCampaign: string;
  Status: string;
  PreBroker: string;
  FTD: string;
  Broker: string;
  DealDate: string;
  CreateUser: string;
  CreateDate: string;
  Note: string;
  Account: string;
  Country: string;
  Url: string;
  IsDup: string;
}

/**
 * Parse Vietnamese date format DD/MM/YYYY
 * CRITICAL: Must handle 8000+ rows without errors
 * Must return correct year (2026, NOT 2001/2015/2024)
 */
const parseDate = (dateStr: string | undefined, fieldName: string = 'date'): Date | null => {
  // Handle null/empty cases
  if (!dateStr || dateStr.trim() === '' || dateStr.toUpperCase() === 'NULL') {
    return null;
  }
  
  // Reject time-format strings like "00:00.0", "56:16.7", etc.
  if (dateStr.includes(':')) {
    return null;
  }
  
  const trimmed = dateStr.trim();
  
  // Primary format: DD/MM/YYYY (Vietnamese standard)
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    
    if (parts.length !== 3) {
      console.warn(`[DATE PARSE] Invalid format for ${fieldName}: "${dateStr}" - Expected DD/MM/YYYY`);
      return null;
    }
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    
    // Validate numeric conversion
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      console.warn(`[DATE PARSE] Non-numeric values in ${fieldName}: "${dateStr}"`);
      return null;
    }
    
    // CRITICAL VALIDATION: Year range for business data
    if (year < 2020 || year > 2030) {
      console.error(`[DATE PARSE] ❌ INVALID YEAR ${year} in ${fieldName}: "${dateStr}" - Must be 2020-2030`);
      return null;
    }
    
    // Month validation
    if (month < 1 || month > 12) {
      console.warn(`[DATE PARSE] Invalid month ${month} in ${fieldName}: "${dateStr}"`);
      return null;
    }
    
    // Day validation
    if (day < 1 || day > 31) {
      console.warn(`[DATE PARSE] Invalid day ${day} in ${fieldName}: "${dateStr}"`);
      return null;
    }
    
    // Create date using constructor (month is 0-indexed in JS)
    const date = new Date(year, month - 1, day);
    
    // Verify date didn't roll over (e.g., Feb 30 → Mar 2)
    if (
      date.getDate() !== day ||
      date.getMonth() !== (month - 1) ||
      date.getFullYear() !== year
    ) {
      console.warn(`[DATE PARSE] Date rollover detected in ${fieldName}: "${dateStr}"`);
      return null;
    }
    
    return date;
  }
  
  // Fallback: YYYY-MM-DD format
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year >= 2020 && year <= 2030) {
        return date;
      }
    }
  }
  
  console.warn(`[DATE PARSE] Unrecognized format for ${fieldName}: "${dateStr}"`);
  return null;
};

/**
 * Normalize Vietnamese phone numbers
 * Handle: 84xxxxxxxxx, 0xxxxxxxxx, empty, "Chưa xin số"
 */
const normalizePhone = (phoneStr: string | undefined | null): string | null => {
  if (!phoneStr || phoneStr.trim() === '') {
    return null;
  }
  
  let phone = phoneStr.trim();
  
  // Handle Vietnamese placeholder text
  const emptyIndicators = ['chưa xin số', 'chưa có', 'null', 'n/a', '-'];
  if (emptyIndicators.some(indicator => phone.toLowerCase() === indicator)) {
    return null;
  }
  
  // Remove non-numeric characters
  phone = phone.replace(/[^0-9]/g, '');
  
  if (phone === '') {
    return null;
  }
  
  // Convert 84xxxxxxxxx to 0xxxxxxxxx
  if (phone.startsWith('84')) {
    phone = '0' + phone.substring(2);
  }
  
  // Validate Vietnamese phone number length (10-11 digits starting with 0)
  if (phone.startsWith('0') && phone.length >= 10 && phone.length <= 11) {
    return phone;
  }
  
  // If doesn't match pattern, return null rather than invalid phone
  console.warn(`[PHONE] Invalid phone number format: "${phoneStr}" → rejected`);
  return null;
};

/**
 * Check if customer already exists in DB
 * Uses: phone (primary), email (secondary)
 */
const checkDuplicate = async (
  queryRunner: any,
  phone: string | null,
  email: string | null,
  name: string,
  isDupCount: number
): Promise<boolean> => {
  // If CSV flags as duplicate, check more strictly
  if (isDupCount > 0) {
    // Check by phone
    if (phone) {
      const existingByPhone = await queryRunner.manager.findOne(Customer, {
        where: { phone }
      });
      if (existingByPhone) {
        console.log(`[DUP] Skipping duplicate phone: ${phone} (${name})`);
        return true;
      }
    }
    
    // Check by email (if phone is null)
    if (!phone && email) {
      const existingByEmail = await queryRunner.manager.findOne(Customer, {
        where: { email }
      });
      if (existingByEmail) {
        console.log(`[DUP] Skipping duplicate email: ${email} (${name})`);
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Map legacy status codes to new system
 */
const mapStatus = (statusCode: string): string => {
  const statusMap: Record<string, string> = {
    '0': 'pending',      // "new" → pending (DB enum has no 'new')
    '1': 'closed',
    '2': 'potential',
    '3': 'pending',
    '4': 'pending',
    '5': 'lost',          // "rejected" → lost (DB enum has no 'rejected')
    '6': 'pending',
    '7': 'inactive',
    '8': 'pending',
  };
  
  const status = statusMap[statusCode?.trim()];
  if (!status) {
    console.warn(`[STATUS] Unknown status code: "${statusCode}" → defaulting to "pending"`);
    return 'pending';
  }
  
  return status;
};

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

    // Ensure error log is empty at start
    if (fs.existsSync('./import-errors.log')) {
      fs.unlinkSync('./import-errors.log');
    }

    const csvFile = fs.readFileSync(csvFilePath, 'utf-8');

    const parsed = Papa.parse<CSVRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
    });

    console.log(`[IMPORT] Starting migration of ${parsed.data.length} records...`);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // PERFORMANCE OPTIMIZATION FOR 8000 RECORDS
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    await queryRunner.query('SET UNIQUE_CHECKS = 0');

    // Track statistics
    let importedCustomers = 0;
    let importedNotes = 0;
    let importedDeposits = 0;
    let skippedDuplicates = 0;
    let skippedErrors = 0;

    try {
      // Process each row
      for (let i = 0; i < parsed.data.length; i++) {
        const row = parsed.data[i];
        const rowNum = i + 2; // +2 for Excel row number (header + 0-index)
        
        try {
          // Skip completely empty rows
          if (!row.ID || !row.Name || row.Name.trim() === '') {
            continue;
          }
          
          // === STEP 1: PARSE & NORMALIZE DATA ===
          
          const phone = normalizePhone(row.Phone);
          const email = row.Mail?.trim() || null;
          const name = row.Name.trim();
          
          // Check duplicate
          const isDupCount = parseInt(row.IsDup || '0');
          const isDuplicate = await checkDuplicate(queryRunner, phone, email, name, isDupCount);
          
          if (isDuplicate) {
            skippedDuplicates++;
            continue;
          }
          
          // === STEP 2: PARSE DATES ===
          const rawInputDate = row.Dateinput || row.Date;
          let inputDate = parseDate(rawInputDate, `Row ${rowNum} Dateinput`);
          // Fallback: try CreateDate column
          if (!inputDate && row.CreateDate) {
            inputDate = parseDate(row.CreateDate, `Row ${rowNum} CreateDate-fallback`);
          }
          // Final fallback: use current date if no date found at all
          if (!inputDate) {
            inputDate = new Date();
          }
          
          const dealDate = parseDate(row.DealDate, `Row ${rowNum} DealDate`);
          
          // === STEP 3: MAP STATUS & DATES ===
          
          const status = mapStatus(row.Status);
          
          let assignedDate: Date | null = null;
          let closedDate: Date | null = null;
          
          if (status === 'closed' && dealDate) {
            closedDate = dealDate;
          } else if (dealDate) {
            assignedDate = dealDate;
          }
          
          // === STEP 4: MAP SOURCE ===
          
          // DB enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'LinkedIn', 'Other']
          const sourceInput = row.UTMSource?.toLowerCase()?.trim() || '';
          let source = 'Other';
          if (sourceInput.includes('facebook')) source = 'Facebook';
          else if (sourceInput.includes('tiktok') || sourceInput.includes('tik tok')) source = 'TikTok';
          else if (sourceInput.includes('google') || sourceInput === 'gg sheet') source = 'Google';
          else if (sourceInput.includes('instagram')) source = 'Instagram';
          else if (sourceInput.includes('linkedin')) source = 'LinkedIn';
          // All others (zalo, telegram, form, cá nhân, khách cá nhân, etc.) → 'Other'
          
          // Helper to safely truncate strings
          const truncate = (val: string | null | undefined, length: number) => {
            if (!val) return val;
            return val.length > length ? val.substring(0, length) : val;
          };

          // === STEP 5: CREATE CUSTOMER ===
          
          const customer = queryRunner.manager.create(Customer, {
            name: truncate(name, 100),
            phone: truncate(phone, 20),
            email: truncate(email, 255),
            source: source as any,
            campaign: truncate(row.UTMCampaign?.trim() || null, 100),
            status: status as any,
            broker: truncate(row.Broker?.trim() || null, 100),
            inputDate: inputDate,
            assignedDate: assignedDate,
            closedDate: closedDate,
            note: row.Note?.trim() || null,
            salesUserId: null,
            departmentId: 1,
            createdById: 1,
            createdBy_OLD: 1,
            createdAt: inputDate,
          } as any);
          
          const savedCustomer = await queryRunner.manager.save(customer);
          importedCustomers++;
          
          // Progress logging (every 100 records for 8k dataset)
          if (importedCustomers % 100 === 0) {
            console.log(`[PROGRESS] ${importedCustomers} customers imported...`);
          }
          
          // === STEP 6: CREATE NOTE FROM QUESTION ===
          
          const questionText = row.Question?.trim();
          if (questionText && questionText !== '----' && questionText.toUpperCase() !== 'NULL') {
            const note = queryRunner.manager.create(CustomerNote, {
              customerId: savedCustomer.id,
              note: questionText,
              noteType: 'general' as any,
              isImportant: false,
              createdBy: 1,
              createdAt: inputDate,
            });
            await queryRunner.manager.save(note);
            importedNotes++;
          }
          
          // === STEP 7: CREATE DEPOSIT IF FTD > 0 ===
          
          const ftdValue = row.FTD?.trim();
          const ftd = parseFloat(ftdValue || '0');
          
          if (!isNaN(ftd) && ftd > 0) {
            const broker = row.Broker?.trim() || row.PreBroker?.trim() || 'Unknown';
            const depositDate = closedDate || assignedDate || inputDate;
            
            const deposit = queryRunner.manager.create(Deposit, {
              customerId: savedCustomer.id,
              amount: ftd,
              depositDate: depositDate,
              broker: broker,
              note: `FTD từ hệ thống cũ - Import ${new Date().toISOString().split('T')[0]}`,
              createdById: 1,
              createdBy_OLD: 1,
            } as any);
            
            await queryRunner.manager.save(deposit);
            importedDeposits++;
          }
          
        } catch (error: any) {
          console.error(`[ERROR] Row ${rowNum} (${row.Name}): ${error.message}`);
          
          // Log to file for review
          fs.appendFileSync(
            './import-errors.log',
            `${new Date().toISOString()} | Row ${rowNum} | ${row.Name} | ${error.message}\n`
          );
          
          skippedErrors++;
          continue; // Skip this row, continue with next
        }
      }

      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.query('SET UNIQUE_CHECKS = 1');

      await queryRunner.commitTransaction();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // === FINAL SUMMARY ===
      console.log('\n' + '='.repeat(60));
      console.log(`✅ IMPORT COMPLETED IN ${duration}s`);
      console.log('='.repeat(60));
      console.log(`   Customers imported: ${importedCustomers}`);
      console.log(`   Notes created: ${importedNotes}`);
      console.log(`   Deposits created: ${importedDeposits}`);
      console.log(`   Duplicates skipped: ${skippedDuplicates}`);
      console.log(`   Errors skipped: ${skippedErrors}`);
      console.log('='.repeat(60) + '\n');

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
    process.exit(0);
  }
}

importMarketingData();
