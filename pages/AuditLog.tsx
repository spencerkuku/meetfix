import React from 'react';
import { useData } from '../App';
import { AuditAction } from '../types';
import { History } from 'lucide-react';

const actionLabels: Record<AuditAction, string> = {
  ROLE_CHANGE: '角色變更',
  BOOKING_APPROVAL: '預約審核',
  ACCOUNT_APPROVAL: '帳號核准',
  REPAIR_STATUS_CHANGE: '報修狀態變更',
  AUTO_APPROVED_DOMAIN_CHANGE: '自動核准網域變更',
};

export const AuditLog: React.FC = () => {
  const { auditLog } = useData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <History className="text-blue-600" /> 稽核紀錄
        </h1>
        <p className="text-slate-500">角色變更、預約審核、帳號核准與報修狀態變更的操作紀錄</p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="p-4">時間</th>
              <th className="p-4">操作者</th>
              <th className="p-4">動作</th>
              <th className="p-4">對象</th>
              <th className="p-4">內容</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {auditLog.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="p-4 text-slate-500 text-sm whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                <td className="p-4">
                  <div className="font-medium text-slate-700">{entry.actorName}</div>
                  <div className="text-xs text-slate-400">{entry.actorEmail}</div>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {actionLabels[entry.action]}
                  </span>
                </td>
                <td className="p-4 text-slate-600 text-sm">{entry.targetType} · {entry.targetId}</td>
                <td className="p-4 text-slate-600 text-sm">{entry.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {auditLog.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            目前沒有稽核紀錄
          </div>
        )}
      </div>
    </div>
  );
};
