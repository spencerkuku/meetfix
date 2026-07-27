export interface CreateBookingDto {
  roomId: string;
  title: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
}
