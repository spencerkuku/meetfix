import React, { createContext, useContext, useEffect, useState } from 'react';
import { Room } from '../types';
import { fetchRooms, createRoom, updateRoomApi, deleteRoomApi, RoomFormInput } from '../services/rooms';
import { useAuthData } from './auth';

export interface RoomsData {
  rooms: Room[];
  addRoom: (input: RoomFormInput, photo?: File) => Promise<void>;
  updateRoom: (id: string, input: Partial<RoomFormInput>, photo?: File) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
}

const RoomsContext = createContext<RoomsData | undefined>(undefined);

export const useRoomsData = () => {
  const context = useContext(RoomsContext);
  if (!context) throw new Error('useRoomsData must be used within a RoomsProvider');
  return context;
};

export const RoomsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthData();
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setRooms([]);
      return;
    }
    fetchRooms().then(setRooms).catch(() => setRooms([]));
  }, [currentUser]);

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
    <RoomsContext.Provider value={{ rooms, addRoom, updateRoom, removeRoom }}>
      {children}
    </RoomsContext.Provider>
  );
};
