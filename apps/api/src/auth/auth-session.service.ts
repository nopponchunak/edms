import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MoreThan, Repository } from 'typeorm';
import { AuthSessionEntity } from './entities/auth-session.entity';

export interface NewAuthSession {
  subject: string;
  username: string;
  provider: 'ldap' | 'local';
  claims: Record<string, unknown>;
}

@Injectable()
export class AuthSessionService {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
    private readonly config: ConfigService,
  ) {}

  async issue(input: NewAuthSession) {
    const refreshToken = this.newToken();
    const refreshExpiresIn = this.expirySeconds(
      this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d'),
    );
    const session = this.sessions.create({
      id: randomUUID(),
      tokenHash: this.hash(refreshToken),
      subject: input.subject,
      username: input.username,
      provider: input.provider,
      claims: input.claims,
      expiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
      lastUsedAt: null,
      revokedAt: null,
    });
    await this.sessions.save(session);
    return { session, refreshToken, refreshExpiresIn };
  }

  async validate(refreshToken: string): Promise<AuthSessionEntity> {
    const session = await this.sessions.findOne({
      where: {
        tokenHash: this.hash(refreshToken),
        expiresAt: MoreThan(new Date()),
      },
    });
    if (!session || session.revokedAt) this.reject();
    return session;
  }

  async rotate(session: AuthSessionEntity, currentToken: string) {
    const refreshToken = this.newToken();
    const now = new Date();
    const result = await this.sessions.createQueryBuilder()
      .update(AuthSessionEntity)
      .set({
        tokenHash: this.hash(refreshToken),
        lastUsedAt: now,
        updatedAt: now,
      })
      .where('id = :id', { id: session.id })
      .andWhere('token_hash = :tokenHash', { tokenHash: this.hash(currentToken) })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > :now', { now })
      .execute();
    if (result.affected !== 1) this.reject();
    return {
      refreshToken,
      refreshExpiresIn: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.sessions.createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ revokedAt: new Date() })
      .where('token_hash = :tokenHash', { tokenHash: this.hash(refreshToken) })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  private newToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private expirySeconds(value: string): number {
    const match = value.trim().match(/^(\d+)([smhd])?$/i);
    if (!match) return 604800;
    const amount = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    return amount * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1);
  }

  private reject(): never {
    throw new UnauthorizedException('Refresh token is invalid or expired.');
  }
}
