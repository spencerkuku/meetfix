import React, { createContext, useContext, useEffect, useState } from 'react';
import { RepairTicket, RepairCategory } from '../types';
import {
  fetchRepairs,
  createRepairTicket,
  updateRepairTicket,
  updateRepairContent,
  deleteRepairTicket,
  fetchRepairCategories,
  createRepairCategory,
  deleteRepairCategory,
  RepairTicketFormInput,
  UpdateRepairTicketInput,
  UpdateRepairContentInput,
} from '../services/repairs';
import { useAuthData } from './auth';

export interface RepairsData {
  repairs: RepairTicket[];
  repairCategories: RepairCategory[];
  addRepair: (input: RepairTicketFormInput, photo?: File) => Promise<void>;
  updateRepair: (id: string, updates: UpdateRepairTicketInput) => Promise<void>;
  editRepairContent: (id: string, input: UpdateRepairContentInput, photo?: File) => Promise<void>;
  deleteRepair: (id: string) => Promise<void>;
  addRepairCategory: (name: string) => Promise<void>;
  removeRepairCategory: (id: string) => Promise<void>;
}

const RepairsContext = createContext<RepairsData | undefined>(undefined);

export const useRepairsData = () => {
  const context = useContext(RepairsContext);
  if (!context) throw new Error('useRepairsData must be used within a RepairsProvider');
  return context;
};

// Repair Categories are managed alongside Repair Tickets here (via the
// Admin page), not split into AdminData — they're an Admin-only action on
// a Repairs-domain resource, the same way Room CRUD lives in RoomsData
// rather than AdminData.
export const RepairsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthData();
  const [repairs, setRepairs] = useState<RepairTicket[]>([]);
  const [repairCategories, setRepairCategories] = useState<RepairCategory[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setRepairs([]);
      setRepairCategories([]);
      return;
    }
    fetchRepairs().then(setRepairs).catch(() => setRepairs([]));
    fetchRepairCategories().then(setRepairCategories).catch(() => setRepairCategories([]));
  }, [currentUser]);

  const addRepair = async (input: RepairTicketFormInput, photo?: File) => {
    const ticket = await createRepairTicket(input, photo);
    setRepairs(prev => [ticket, ...prev]);
  };

  const updateRepair = async (id: string, updates: UpdateRepairTicketInput) => {
    const ticket = await updateRepairTicket(id, updates);
    setRepairs(prev => prev.map(r => r.id === id ? ticket : r));
  };

  const editRepairContent = async (id: string, input: UpdateRepairContentInput, photo?: File) => {
    const ticket = await updateRepairContent(id, input, photo);
    setRepairs(prev => prev.map(r => r.id === id ? ticket : r));
  };

  const deleteRepair = async (id: string) => {
    await deleteRepairTicket(id);
    setRepairs(prev => prev.filter(r => r.id !== id));
  };

  const addRepairCategory = async (name: string) => {
    const category = await createRepairCategory(name);
    setRepairCategories(prev => [...prev, category]);
  };

  const removeRepairCategory = async (id: string) => {
    await deleteRepairCategory(id);
    setRepairCategories(prev => prev.filter(c => c.id !== id));
  };

  return (
    <RepairsContext.Provider value={{
      repairs, repairCategories,
      addRepair, updateRepair, editRepairContent, deleteRepair,
      addRepairCategory, removeRepairCategory,
    }}>
      {children}
    </RepairsContext.Provider>
  );
};
