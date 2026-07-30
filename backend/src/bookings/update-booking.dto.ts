// All fields optional — an edit may touch content only (title/description),
// or reschedule (roomId/startTime/endTime), or both. See BookingsService.update().
export interface UpdateBookingDto {
  title?: string;
  description?: string;
  roomId?: string;
  startTime?: string; // ISO string
  endTime?: string; // ISO string
}
