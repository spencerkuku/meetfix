// multipart/form-data always arrives as strings; this is the raw shape
// before parsing into RepairsService's typed input.
export interface RepairTicketFormBody {
  location?: string;
  category?: string;
  description?: string;
  userClass?: string;
  userPhone?: string;
}

export interface RepairTicketInput {
  location: string;
  category: string;
  description: string;
  userClass: string;
  userPhone: string;
}
