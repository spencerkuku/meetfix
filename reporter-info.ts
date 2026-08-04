// 報修人資料 (see CONTEXT.md's Repair Ticket, and the reporter-info fields
// mirrored onto User) — required wherever it's entered: the Repair Ticket
// form and the Account Settings modal. Shared so the two never drift on
// what counts as "blank" or the message shown for it.
export const REPORTER_INFO_REQUIRED_MESSAGE = '請填寫班級/部門與聯絡電話';

export function isReporterInfoComplete(
  userClass: string,
  userPhone: string,
): boolean {
  return userClass.trim().length > 0 && userPhone.trim().length > 0;
}
