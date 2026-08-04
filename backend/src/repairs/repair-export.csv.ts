import { RepairStatus, RepairTicket } from '@prisma/client';

// Deliberately excludes reporter PII (name/class/phone) and imageUrl — the
// export is a bulk operational report, not a reporter directory. See
// CONTEXT.md's canSeeReporterDetails / repair-visibility for why that PII
// is normally visible to FACILITY_MANAGER/ADMIN in-app but is kept out of a
// downloadable file that can leave the system.
const HEADERS = ['地點', '分類', '描述', '狀態', '管理員回覆', '建立時間'];

const STATUS_LABEL: Record<RepairStatus, string> = {
  [RepairStatus.PENDING]: '待處理',
  [RepairStatus.IN_PROGRESS]: '處理中',
  [RepairStatus.COMPLETED]: '已完成',
};

function escapeCsvField(value: string): string {
  return /["\n\r,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toRow(ticket: RepairTicket): string[] {
  return [
    ticket.location,
    ticket.category,
    ticket.description,
    STATUS_LABEL[ticket.status],
    ticket.adminReply ?? '',
    ticket.createdAt.toISOString(),
  ];
}

// A UTF-8 BOM prefix + CRLF line endings — required for the file to render
// Chinese headers/content correctly (rather than mojibake) when opened
// directly in Excel, which is the primary consumer of this export.
export function buildRepairExportCsv(tickets: RepairTicket[]): string {
  const lines = [HEADERS, ...tickets.map(toRow)].map((row) =>
    row.map(escapeCsvField).join(','),
  );
  return '﻿' + lines.join('\r\n') + '\r\n';
}
