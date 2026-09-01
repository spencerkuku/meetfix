
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AuthCallback } from './pages/AuthCallback';
import { Bookings } from './pages/Bookings';
import { Repairs } from './pages/Repairs';
import { RepairManagement } from './pages/RepairManagement';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { AuditLog } from './pages/AuditLog';
import { RoomManagement } from './pages/RoomManagement';
import { Approvals } from './pages/Approvals';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './state/auth';
import { RoomsProvider } from './state/rooms';
import { BookingsProvider } from './state/bookings';
import { RepairsProvider } from './state/repairs';
import { AdminProvider } from './state/admin';

// Each domain owns its own Provider (state/auth.tsx, rooms.tsx,
// bookings.tsx, repairs.tsx, admin.tsx) instead of one flat DataContext —
// a page imports only the domain hook(s) it actually uses (useAuthData,
// useRoomsData, useBookingsData, useRepairsData, useAdminData). Rooms/
// Bookings/Repairs/Admin all read `currentUser` from AuthProvider to gate
// their own fetch, so AuthProvider must wrap them.
export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <RoomsProvider>
          <BookingsProvider>
            <RepairsProvider>
              <AdminProvider>
                <HashRouter>
                  <Routes>
                    <Route path="/" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/*" element={
                      <Layout>
                        <Routes>
                          <Route path="/bookings" element={<Bookings />} />
                          <Route path="/approvals" element={<Approvals />} />
                          <Route path="/repairs" element={<Repairs />} />
                          <Route path="/repair-management" element={<RepairManagement />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/admin" element={<Admin />} />
                          <Route path="/audit-log" element={<AuditLog />} />
                          <Route path="/rooms" element={<RoomManagement />} />
                          <Route path="*" element={<Navigate to="/bookings" replace />} />
                        </Routes>
                      </Layout>
                    } />
                  </Routes>
                </HashRouter>
              </AdminProvider>
            </RepairsProvider>
          </BookingsProvider>
        </RoomsProvider>
      </AuthProvider>
    </ToastProvider>
  );
};
