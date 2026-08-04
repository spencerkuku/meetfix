
import React, { useMemo } from 'react';
import { useAuthData } from '../state/auth';
import { useBookingsData } from '../state/bookings';
import { useRepairsData } from '../state/repairs';
import { useRoomsData } from '../state/rooms';
import { UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { Button } from '../components/Button';
import { Download, TrendingUp, AlertCircle, CheckCircle2, Clock, Users } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { currentUser } = useAuthData();
  const { bookings } = useBookingsData();
  const { repairs } = useRepairsData();
  const { rooms } = useRoomsData();

  // Role Logic
  const showRepairStats = currentUser && [UserRole.ADMIN, UserRole.FACILITY_MANAGER].includes(currentUser.role);
  const showBookingStats = currentUser && [UserRole.ADMIN, UserRole.FACILITY_MANAGER].includes(currentUser.role);

  // --- Data Preparation ---

  const bookingsPerRoom = useMemo(() => {
    return rooms.map(room => ({
      name: room.name,
      count: bookings.filter(b => b.roomId === room.id).length
    })).sort((a, b) => b.count - a.count);
  }, [bookings, rooms]);

  const repairStatusData = useMemo(() => {
    const counts = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0 };
    repairs.forEach(r => { counts[r.status]++ });
    return [
      { name: '待處理', value: counts.PENDING, color: '#F59E0B' }, // Amber
      { name: '處理中', value: counts.IN_PROGRESS, color: '#3B82F6' }, // Blue
      { name: '已完成', value: counts.COMPLETED, color: '#10B981' }, // Emerald
    ];
  }, [repairs]);

  // Real last-7-days trend, derived from the already-loaded bookings/repairs.
  const weeklyTrendData = useMemo(() => {
      const dayLabels = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
      const days = Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setHours(0, 0, 0, 0);
          date.setDate(date.getDate() - (6 - i));
          return date;
      });

      return days.map(date => {
          const nextDate = new Date(date);
          nextDate.setDate(date.getDate() + 1);
          return {
              day: dayLabels[date.getDay()],
              bookings: bookings.filter(b => {
                  const t = new Date(b.startTime);
                  return t >= date && t < nextDate;
              }).length,
              repairs: repairs.filter(r => {
                  const t = new Date(r.createdAt);
                  return t >= date && t < nextDate;
              }).length,
          };
      });
  }, [bookings, repairs]);

  const handleExport = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      stats: {
        totalBookings: bookings.length,
        totalRepairs: repairs.length,
        bookingsPerRoom,
        repairStatus: repairStatusData
      },
      rawBookings: bookings,
      rawRepairs: repairs
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meetfix-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">統計儀表板</h1>
          <p className="text-slate-500">設施使用與維護狀況總覽</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleExport}>
            <Download size={18} className="mr-2" /> 匯出報表
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
         {showBookingStats && (
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
              <div className="flex justify-between items-start opacity-80 mb-2">
                 <p className="text-sm font-medium">總預約數</p>
                 <TrendingUp size={20}/>
              </div>
              <p className="text-3xl font-bold">{bookings.length}</p>
              <p className="text-xs mt-2 opacity-60">本月累計</p>
            </div>
         )}
         
         {showRepairStats && (
            <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-6 rounded-2xl shadow-lg text-white">
              <div className="flex justify-between items-start opacity-80 mb-2">
                 <p className="text-sm font-medium">待處理案件</p>
                 <Clock size={20}/>
              </div>
              <p className="text-3xl font-bold">{repairs.filter(r => r.status === 'PENDING').length}</p>
              <p className="text-xs mt-2 opacity-60">需優先關注</p>
            </div>
         )}

         {showBookingStats && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start text-slate-400 mb-2">
                    <p className="text-sm font-medium text-slate-500">管理會議室</p>
                    <Users size={20}/>
                </div>
                <p className="text-3xl font-bold text-slate-800">{rooms.length}</p>
                <p className="text-xs mt-2 text-slate-400">可預約空間</p>
            </div>
         )}

         {showRepairStats && (
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex justify-between items-start text-slate-400 mb-2">
                 <p className="text-sm font-medium text-slate-500">維修完成率</p>
                 <CheckCircle2 size={20} className="text-green-500"/>
              </div>
              <p className="text-3xl font-bold text-green-600">
                {Math.round((repairs.filter(r => r.status === 'COMPLETED').length / (repairs.length || 1)) * 100)}%
              </p>
              <p className="text-xs mt-2 text-slate-400">服務效能指標</p>
            </div>
         )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Booking Chart */}
        {showBookingStats && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-500" size={20}/> 熱門會議室排行
            </h3>
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bookingsPerRoom} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={30} name="預約次數" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Repair Chart */}
        {showRepairStats && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
              <AlertCircle className="text-orange-500" size={20}/> 報修狀態分佈
            </h3>
            <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={repairStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    cornerRadius={8}
                  >
                    {repairStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0}/>
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{borderRadius: '8px'}} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
              {/* Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <span className="text-3xl font-bold text-slate-700">{repairs.length}</span>
                 <span className="text-xs text-slate-400">總案件</span>
              </div>
            </div>
          </div>
        )}

         {/* Weekly Trend Chart - Visible to Admins/Managers */}
         <div className="col-span-1 lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg text-slate-800 mb-6">最近七天活動趨勢</h3>
            <div className="h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyTrendData}>
                     <defs>
                        <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorRepairs" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                           <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} />
                     <XAxis dataKey="day" axisLine={false} tickLine={false} />
                     <YAxis axisLine={false} tickLine={false}/>
                     <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}/>
                     <Legend />
                     {showBookingStats && <Area type="monotone" dataKey="bookings" name="會議預約" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBookings)" strokeWidth={3} />}
                     {showRepairStats && <Area type="monotone" dataKey="repairs" name="報修通報" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRepairs)" strokeWidth={3} />}
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>
      </div>
    </div>
  );
};
