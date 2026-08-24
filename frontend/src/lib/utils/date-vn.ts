/**
 * Returns the current date and time in Vietnam timezone (GMT+7)
 */
export function getNowVn(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

/**
 * Checks if a given date is in the future compared to current Vietnam time (GMT+7).
 */
export function isFutureVnDate(dateToVerify: any): boolean {
  if (!dateToVerify) return false;

  const date = (dateToVerify && typeof dateToVerify.toDate === 'function') 
    ? dateToVerify.toDate() 
    : new Date(dateToVerify);
    
  if (isNaN(date?.getTime())) return false;

  const nowVn = getNowVn();
  nowVn.setHours(23, 59, 59, 999);

  return date.getTime() > nowVn.getTime();
}
