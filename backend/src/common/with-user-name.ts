// Flattens a Prisma `user` relation (fetched only for its `name`) into a
// `userName` field, so API responses don't leak the full related User row.
// Shared by BookingsService and RepairsService, which both include `user`
// on their entity for exactly this reason.
export function withUserName<T extends { user: { name: string } }>(
  entity: T,
): Omit<T, 'user'> & { userName: string } {
  const { user, ...rest } = entity;
  return { ...rest, userName: user.name };
}
