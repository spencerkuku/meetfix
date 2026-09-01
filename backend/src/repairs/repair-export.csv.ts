import { RepairStatus, RepairTicket } from '@prisma/client';

// Deliberately excludes reporter PII (name/class/phone) and imageUrl — the
// export is a bulk operational report, not a reporter directory. See
// CONTEXT.md's canSeeReporterDetails / repair-visibility for why that PII
// is normally visible to FACILITY_MANAGER/ADMIN in-app but is kept out of a
// downloadable file that can leave the system.
const HEADERS = ['地點', '分類', '描述', '狀態', '維修人員', '管理員回覆', '建立時間'];

const STATUS_LABEL: Record<RepairStatus, string> = {
  [RepairStatus.PENDING]: '待處理',
  [RepairStatus.IN_PROGRESS]: '處理中',
  [RepairStatus.COMPLETED]: '已完成',
};

// Neutralizes CSV/spreadsheet formula injection: a cell beginning with one
// of these characters is interpreted as a formula, not text, by Excel/
// LibreOffice/Google Sheets when the file is opened — e.g. a reporter-
// controlled location/description containing `=HYPERLINK(...)` would
// otherwise execute in a FACILITY_MANAGER/ADMIN's spreadsheet session.
// Prefixing with a single quote forces the cell to render as literal text
// in every major spreadsheet application, and is applied before the
// existing CSV-syntax escaping below.
function escapeCsvField(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\n\r,]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized;
}

// 維修人員 — blank until the ticket has actually been marked COMPLETED; see
// RepairsService.findResolvedByNames for how it's resolved.
function toRow(
  ticket: RepairTicket,
  resolvedByNames: Map<string, string>,
): string[] {
  return [
    ticket.location,
    ticket.category,
    ticket.description,
    STATUS_LABEL[ticket.status],
    resolvedByNames.get(ticket.id) ?? '',
    ticket.adminReply ?? '',
    ticket.createdAt.toISOString(),
  ];
}

// A UTF-8 BOM prefix + CRLF line endings — required for the file to render
// Chinese headers/content correctly (rather than mojibake) when opened
// directly in Excel, which is the primary consumer of this export.
export function buildRepairExportCsv(
  tickets: RepairTicket[],
  resolvedByNames: Map<string, string>,
): string {
  const lines = [
    HEADERS,
    ...tickets.map((ticket) => toRow(ticket, resolvedByNames)),
  ].map((row) => row.map(escapeCsvField).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
