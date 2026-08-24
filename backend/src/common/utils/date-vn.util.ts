export function getNowVn(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

export function todayVnStr(): string {
  const now = getNowVn();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureDateVn(dateToVerify: Date | string): boolean {
  if (!dateToVerify) return false;

  const date = new Date(dateToVerify);
  if (isNaN(date.getTime())) return false;

  const nowVn = getNowVn();
  nowVn.setHours(23, 59, 59, 999);

  return date.getTime() > nowVn.getTime();
}
