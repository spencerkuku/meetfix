
import React, { createContext, useContext, useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { User, Room, Booking, RepairTicket, UserRole, RepairStatus, DEFAULT_REPAIR_CATEGORIES } from './types';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { Bookings } from './pages/Bookings';
import { Repairs } from './pages/Repairs';
import { RepairManagement } from './pages/RepairManagement';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { RoomManagement } from './pages/RoomManagement';
import { Approvals } from './pages/Approvals';
import { ToastProvider } from './components/Toast';
import { getToken, setToken, clearToken, fetchCurrentUser, googleLoginUrl, exchangeLoginCode } from './services/auth';

// --- Mock Data ---
const MOCK_USERS: User[] = [
  { id: 'u1', name: '陳小美', email: 'alice@corp.com', role: UserRole.USER, avatar: 'https://i.pravatar.cc/150?u=a', class: '資訊三甲', phone: '0912-345-678' },
  { id: 'u2', name: '張維修', email: 'bob@corp.com', role: UserRole.MAINTENANCE, avatar: 'https://i.pravatar.cc/150?u=b', phone: '0922-333-444' },
  { id: 'u3', name: '林經理', email: 'carol@corp.com', role: UserRole.ROOM_MANAGER, avatar: 'https://i.pravatar.cc/150?u=c' },
  { id: 'u4', name: '王大明 (Admin)', email: 'dave@corp.com', role: UserRole.ADMIN, avatar: 'https://i.pravatar.cc/150?u=d' },
];

const MOCK_ROOMS: Room[] = [
  { id: 'r1', name: 'A101 會議室', capacity: 10, equipment: ['投影機', '白板'], imageUrl: 'https://picsum.photos/800/400?random=1', requiresApproval: false },
  { id: 'r2', name: 'B202 討論室', capacity: 4, equipment: ['電視螢幕'], imageUrl: 'https://picsum.photos/800/400?random=2', requiresApproval: true },
  { id: 'r3', name: 'C303 董事會議廳', capacity: 20, equipment: ['視訊設備', '投影機', '咖啡機'], imageUrl: 'https://picsum.photos/800/400?random=3', requiresApproval: true },
];

const INITIAL_BOOKINGS: Booking[] = [
  { id: 'b1', roomId: 'r1', userId: 'u1', userName: '陳小美', title: '週會', description: '每週例行進度報告與問題討論', startTime: new Date(new Date().setHours(9,0,0,0)).toISOString(), endTime: new Date(new Date().setHours(10,0,0,0)).toISOString(), status: 'CONFIRMED' },
  { id: 'b2', roomId: 'r2', userId: 'u3', userName: '林經理', title: '客戶訪談', description: '與重要客戶進行需求訪談', startTime: new Date(new Date().setHours(14,0,0,0)).toISOString(), endTime: new Date(new Date().setHours(15,0,0,0)).toISOString(), status: 'CONFIRMED' },
  { id: 'b3', roomId: 'r3', userId: 'u1', userName: '陳小美', title: '專案報告', description: 'Q3 專案結案報告', startTime: new Date(new Date().setHours(16,0,0,0)).toISOString(), endTime: new Date(new Date().setHours(17,0,0,0)).toISOString(), status: 'PENDING_APPROVAL' },
];

const INITIAL_REPAIRS: RepairTicket[] = [
  { 
    id: 'rp1', 
    roomId: 'r1', 
    userId: 'u1', 
    userName: '陳小美', 
    userClass: '資訊三甲',
    userPhone: '0912-345-678',
    category: '硬體設備',
    description: '投影機燈泡閃爍', 
    status: RepairStatus.PENDING, 
    createdAt: new Date(Date.now() - 86400000).toISOString(), 
  },
  { 
    id: 'rp2', 
    roomId: '一樓大廳', 
    userId: 'u4', 
    userName: '王大明', 
    category: '桌椅家具',
    description: '咖啡機漏水', 
    status: RepairStatus.COMPLETED, 
    createdAt: new Date(Date.now() - 172800000).toISOString(), 
    adminReply: '已清理並更換墊圈。', 
  },
];

// --- Context ---

interface DataContextType {
  currentUser: User | null;
  mockUsers: User[];
  rooms: Room[];
  bookings: Booking[];
  repairs: RepairTicket[];
  repairCategories: string[];
  authLoading: boolean;
  loginWithGoogle: () => void;
  completeGoogleLogin: (code: string) => Promise<void>;
  logout: () => void;
  addBooking: (booking: Booking) => void;
  updateBooking: (id: string, updates: Partial<Booking>) => void;
  removeBooking: (id: string) => void;
  addRepair: (repair: RepairTicket) => void;
  updateRepair: (id: string, updates: Partial<RepairTicket>) => void;
  updateMockRole: (userId: string, role: UserRole) => void;
  updateUser: (userId: string, data: Partial<User>) => void;
  addRepairCategory: (category: string) => void;
  removeRepairCategory: (category: string) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  removeRoom: (id: string) => void;
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
  const [bookings, setBookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [repairs, setRepairs] = useState<RepairTicket[]>(INITIAL_REPAIRS);
  const [rooms, setRooms] = useState<Room[]>(MOCK_ROOMS);
  const [repairCategories, setRepairCategories] = useState<string[]>(DEFAULT_REPAIR_CATEGORIES);

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

  const logout = () => {
    clearToken();
    setCurrentUser(null);
  };

  const addBooking = (booking: Booking) => setBookings(prev => [...prev, booking]);
  
  const updateBooking = (id: string, updates: Partial<Booking>) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const removeBooking = (id: string) => {
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const addRepair = (repair: RepairTicket) => setRepairs(prev => [...prev, repair]);
  
  const updateRepair = (id: string, updates: Partial<RepairTicket>) => {
    setRepairs(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const updateMockRole = (userId: string, role: UserRole) => {
    setMockUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
  };

  const updateUser = (userId: string, data: Partial<User>) => {
    setMockUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
    if (currentUser && currentUser.id === userId) {
      setCurrentUser(prev => prev ? { ...prev, ...data } : null);
    }
  };

  const addRepairCategory = (category: string) => {
    if (!repairCategories.includes(category)) {
      setRepairCategories([...repairCategories, category]);
    }
  };

  const removeRepairCategory = (category: string) => {
    setRepairCategories(prev => prev.filter(c => c !== category));
  };

  const addRoom = (room: Room) => {
    setRooms(prev => [...prev, room]);
  };

  const updateRoom = (id: string, updates: Partial<Room>) => {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRoom = (id: string) => {
    setRooms(prev => prev.filter(r => r.id !== id));
  };

  return (
    <DataContext.Provider value={{
      currentUser, mockUsers, rooms, bookings, repairs, repairCategories, authLoading,
      loginWithGoogle, completeGoogleLogin, logout, addBooking, updateBooking, removeBooking,
      addRepair, updateRepair, updateMockRole, updateUser,
      addRepairCategory, removeRepairCategory, addRoom, updateRoom, removeRoom
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
