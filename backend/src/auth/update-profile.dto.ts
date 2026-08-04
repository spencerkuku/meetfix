// Frontend-facing names (`class`/`phone`) — translated to the Prisma
// User model's `userClass`/`userPhone` fields inside AuthService. See
// CONTEXT.md's Repair Ticket reporter-info fields, which this mirrors.
export interface UpdateProfileDto {
  class: string;
  phone: string;
}
