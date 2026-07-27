import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, User } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

// Must run after JwtAuthGuard (which populates request.user). Enforces the
// Role model — the four Roles are never merged, so this is a plain
// membership check, not a hierarchy.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest<{ user: User }>();
    return requiredRoles.includes(user.role);
  }
}
