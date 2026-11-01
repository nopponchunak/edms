import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Bearer token is required.');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: this.config.get<string>('JWT_SECRET') });
      (request as Request & { user?: Record<string, unknown> }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Bearer token is invalid or expired.');
    }
  }
}
