// multipart/form-data always arrives as strings — mirrors
// RepairTicketFormBody's raw-shape convention. `removePhoto: 'true'` clears
// imageUrl back to none; a newly-uploaded `photo` file (handled separately
// by the controller) takes precedence over removePhoto if both are somehow
// sent together.
export interface UpdateRepairTicketContentFormBody {
  location?: string;
  category?: string;
  description?: string;
  removePhoto?: string;
}

export interface UpdateRepairTicketContentDto {
  location?: string;
  category?: string;
  description?: string;
  removePhoto?: boolean;
}
