// api/index.ts
import { AppFactory } from '../backend/src/AppFactory';

// Khởi tạo Express app từ factory
const { expressApp }: { expressApp: any } = AppFactory.create();

// Export cho Vercel serverless function
export default expressApp;
