
import React, { createContext, useContext, useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { User, Room, Booking, RepairTicket, RepairCategory, UserRole, PendingAccount, AutoApprovedDomain, AuditLogEntry } from './types';
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
import { getToken, setToken, clearToken, fetchCurrentUser, googleLoginUrl, exchangeLoginCode, registerWithPassword as registerWithPasswordApi, loginWithPassword as loginWithPasswordApi } from './services/auth';
import { fetchRooms, createRoom, updateRoomApi, deleteRoomApi, RoomFormInput } from './services/rooms';
import { fetchBookings, createBooking, cancelBooking as cancelBookingApi, deleteBooking as deleteBookingApi, approveBooking as approveBookingApi, rejectBooking as rejectBookingApi, CreateBookingInput } from './services/bookings';
import { fetchRepairs, createRepairTicket, updateRepairTicket, fetchRepairCategories, createRepairCategory, deleteRepairCategory, RepairTicketFormInput, UpdateRepairTicketInput } from './services/repairs';
import { fetchUsers, updateUserRole as updateUserRoleApi, fetchPendingAccounts, approveAccount as approveAccountApi, fetchAutoApprovedDomains, addAutoApprovedDomain as addAutoApprovedDomainApi, updateAutoApprovedDomain as updateAutoApprovedDomainApi, removeAutoApprovedDomain as removeAutoApprovedDomainApi } from './services/admin';
import { fetchAuditLog } from './services/audit';

// --- Mock Data ---
const MOCK_USERS: User[] = [
  { id: 'u1', name: '陳小美', email: 'alice@corp.com', role: UserRole.USER, avatarUrl: null, class: '資訊三甲', phone: '0912-345-678' },
  { id: 'u2', name: '張維修', email: 'bob@corp.com', role: UserRole.MAINTENANCE, avatarUrl: null, phone: '0922-333-444' },
  { id: 'u3', name: '林經理', email: 'carol@corp.com', role: UserRole.ROOM_MANAGER, avatarUrl: null },
  { id: 'u4', name: '王大明 (Admin)', email: 'dave@corp.com', role: UserRole.ADMIN, avatarUrl: null },
];

// --- Context ---

interface DataContextType {
  currentUser: User | null;
  mockUsers: User[];
  rooms: Room[];
  bookings: Booking[];
  repairs: RepairTicket[];
  repairCategories: RepairCategory[];
  authLoading: boolean;
  loginWithGoogle: () => void;
  completeGoogleLogin: (code: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  registerWithPassword: (email: string, name: string, password: string) => Promise<'ACTIVE' | 'PENDING'>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
  addBooking: (input: CreateBookingInput) => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  approveBooking: (id: string) => Promise<void>;
  rejectBooking: (id: string) => Promise<void>;
  addRepair: (input: RepairTicketFormInput, photo?: File) => Promise<void>;
  updateRepair: (id: string, updates: UpdateRepairTicketInput) => Promise<void>;
  updateUser: (userId: string, data: Partial<User>) => void;
  // Admin-only: real User/Account administration (ticket #4). `users` and
  // `pendingAccounts`/`autoApprovedDomains` are only fetched for an ADMIN
  // currentUser — see the effect below.
  users: User[];
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  pendingAccounts: PendingAccount[];
  approveAccount: (accountId: string, role: UserRole) => Promise<void>;
  autoApprovedDomains: AutoApprovedDomain[];
  addAutoApprovedDomain: (domain: string, allowSubdomains?: boolean) => Promise<void>;
  updateAutoApprovedDomain: (id: string, allowSubdomains: boolean) => Promise<void>;
  removeAutoApprovedDomain: (id: string) => Promise<void>;
  auditLog: AuditLogEntry[];
  addRepairCategory: (name: string) => Promise<void>;
  removeRepairCategory: (id: string) => Promise<void>;
  addRoom: (input: RoomFormInput, photo?: File) => Promise<void>;
  updateRoom: (id: string, input: Partial<RoomFormInput>, photo?: File) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within a DataProvider');
  return context;
};

const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mockUsers, setMockUsers] = useState<User[]>(MOCK_USERS);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [repairs, setRepairs] = useState<RepairTicket[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [repairCategories, setRepairCategories] = useState<RepairCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[]>([]);
  const [autoApprovedDomains, setAutoApprovedDomains] = useState<AutoApprovedDomain[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    fetchCurrentUser(token).then(user => {
      if (!user) clearToken();
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setRooms([]);
      setBookings([]);
      setRepairs([]);
      setRepairCategories([]);
      return;
    }
    fetchRooms().then(setRooms).catch(() => setRooms([]));
    fetchBookings().then(setBookings).catch(() => setBookings([]));
    fetchRepairs().then(setRepairs).catch(() => setRepairs([]));
    fetchRepairCategories().then(setRepairCategories).catch(() => setRepairCategories([]));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) {
      setUsers([]);
      setPendingAccounts([]);
      setAutoApprovedDomains([]);
      setAuditLog([]);
      return;
    }
    fetchUsers().then(setUsers).catch(() => setUsers([]));
    fetchPendingAccounts().then(setPendingAccounts).catch(() => setPendingAccounts([]));
    fetchAutoApprovedDomains().then(setAutoApprovedDomains).catch(() => setAutoApprovedDomains([]));
    fetchAuditLog().then(setAuditLog).catch(() => setAuditLog([]));
  }, [currentUser]);

  const loginWithGoogle = () => {
    window.location.href = googleLoginUrl();
  };

  const completeGoogleLogin = async (code: string) => {
    const token = await exchangeLoginCode(code);
    if (!token) return;
    setToken(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  // Re-fetches /auth/me against the existing session — used after linking a
  // Google account, so the sidebar/profile reflect the new googleLinked
  // status without requiring a fresh login.
  const refreshCurrentUser = async () => {
    const token = getToken();
    if (!token) return;
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  const registerWithPassword = (email: string, name: string, password: string) => {
    return registerWithPasswordApi(email, name, password);
  };

  const loginWithPassword = async (email: string, password: string) => {
    const token = await loginWithPasswordApi(email, password);
    setToken(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  const logout = () => {
    clearToken();
    setCurrentUser(null);
  };

  const addBooking = async (input: CreateBookingInput) => {
    const booking = await createBooking(input);
    setBookings(prev => [...prev, booking]);
  };

  const cancelBooking = async (id: string) => {
    const booking = await cancelBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const deleteBooking = async (id: string) => {
    await deleteBookingApi(id);
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const approveBooking = async (id: string) => {
    const booking = await approveBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const rejectBooking = async (id: string) => {
    const booking = await rejectBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const addRepair = async (input: RepairTicketFormInput, photo?: File) => {
    const ticket = await createRepairTicket(input, photo);
    setRepairs(prev => [ticket, ...prev]);
  };

  const updateRepair = async (id: string, updates: UpdateRepairTicketInput) => {
    const ticket = await updateRepairTicket(id, updates);
    setRepairs(prev => prev.map(r => r.id === id ? ticket : r));
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    const user = await updateUserRoleApi(userId, role);
    setUsers(prev => prev.map(u => u.id === userId ? user : u));
  };

  const approveAccount = async (accountId: string, role: UserRole) => {
    await approveAccountApi(accountId, role);
    setPendingAccounts(prev => prev.filter(a => a.id !== accountId));
    setUsers(await fetchUsers());
  };

  const addAutoApprovedDomain = async (domain: string, allowSubdomains = false) => {
    const created = await addAutoApprovedDomainApi(domain, allowSubdomains);
    setAutoApprovedDomains(prev => [...prev, created]);
  };

  const updateAutoApprovedDomain = async (id: string, allowSubdomains: boolean) => {
    const updated = await updateAutoApprovedDomainApi(id, allowSubdomains);
    setAutoApprovedDomains(prev => prev.map(d => d.id === id ? updated : d));
  };

  const removeAutoApprovedDomain = async (id: string) => {
    await removeAutoApprovedDomainApi(id);
    setAutoApprovedDomains(prev => prev.filter(d => d.id !== id));
  };

  const updateUser = (userId: string, data: Partial<User>) => {
    setMockUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, ...data } : null);
    }
  };

  const addRepairCategory = async (name: string) => {
    const category = await createRepairCategory(name);
    setRepairCategories(prev => [...prev, category]);
  };

  const removeRepairCategory = async (id: string) => {
    await deleteRepairCategory(id);
    setRepairCategories(prev => prev.filter(c => c.id !== id));
  };

  const addRoom = async (input: RoomFormInput, photo?: File) => {
    const room = await createRoom(input, photo);
    setRooms(prev => [...prev, room]);
  };

  const updateRoom = async (id: string, input: Partial<RoomFormInput>, photo?: File) => {
    const room = await updateRoomApi(id, input, photo);
    setRooms(prev => prev.map(r => r.id === id ? room : r));
  };

  const removeRoom = async (id: string) => {
    await deleteRoomApi(id);
    setRooms(prev => prev.filter(r => r.id !== id));
  };

  return (
    <DataContext.Provider value={{
      currentUser, mockUsers, rooms, bookings, repairs, repairCategories, authLoading,
      loginWithGoogle, completeGoogleLogin, refreshCurrentUser, registerWithPassword, loginWithPassword, logout,
      addBooking, cancelBooking, deleteBooking, approveBooking, rejectBooking,
      addRepair, updateRepair, updateUser,
      addRepairCategory, removeRepairCategory, addRoom, updateRoom, removeRoom,
      users, updateUserRole, pendingAccounts, approveAccount,
      autoApprovedDomains, addAutoApprovedDomain, updateAutoApprovedDomain, removeAutoApprovedDomain, auditLog
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <DataProvider>
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
      </DataProvider>
    </ToastProvider>
  );
};
