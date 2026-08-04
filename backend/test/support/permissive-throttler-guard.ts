import type { CanActivate } from '@nestjs/common';

// Every e2e suite but each file's own dedicated "rate limiting" block calls
// a throttled endpoint many times in quick succession — far more than the
// real limit allows. Override ThrottlerGuard with this for the suite's
// shared app instance so those tests exercise their own concerns, not the
// throttle; a dedicated block builds its own app instance with the real
// ThrottlerGuard to test throttling itself.
export const permissiveThrottlerGuard: CanActivate = {
  canActivate: () => true,
};
