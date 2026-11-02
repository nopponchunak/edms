import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IdentityService } from '../identity/identity.service';
import { AuthSessionService } from './auth-session.service';
import { HrisEmployeeService } from './hris-employee.service';
import { LdapAuthService } from './ldap-auth.service';
import { LocalAuthService } from './local-auth.service';

type AccessClaims = Record<string, unknown> & {
  sub: string;
  username: string;
  provider: 'ldap' | 'local';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly ldap: LdapAuthService,
    private readonly local: LocalAuthService,
    private readonly hris: HrisEmployeeService,
    private readonly identity: IdentityService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: AuthSessionService,
  ) {}

  async loginLocal(username: string, password: string) {
    // Anyone other than the emergency super administrator signs in as a database user with the local provider.
    if (username.trim().toLowerCase() !== this.local.superAdminUsername) return this.loginLocalDatabaseUser(username, password);
    const profile = await this.local.authenticate(username, password);
    const claims: AccessClaims = {
      sub: profile.username,
      username: profile.username,
      role: profile.role,
      provider: 'local',
    };
    return this.issueLogin(claims, profile);
  }

  private async loginLocalDatabaseUser(username: string, password: string) {
    const profile = await this.local.authenticateDatabaseUser(username, password);
    const identity = await this.identity.getDatabaseIdentity(profile.userId);
    if (!identity) throw new UnauthorizedException('User account is inactive or unavailable.');
    const claims: AccessClaims = {
      sub: String(profile.userId),
      username: profile.username,
      employeeId: profile.employeeId,
      email: profile.email,
      roles: identity.roles,
      permissions: identity.permissions,
      provider: 'local',
    };
    return this.issueLogin(claims, { ...profile, roles: identity.roles, permissions: identity.permissions });
  }

  async loginWithLdap(username: string, password: string) {
    const ldapIdentity = await this.ldap.authenticate(username, password);
    const employee = await this.hris.findByUsername(ldapIdentity.username);
    if (employee && this.isInactive(employee.active)) {
      throw new ForbiddenException('Employee account is inactive.');
    }
    const profile = {
      username: employee?.username ?? ldapIdentity.username,
      displayName: [employee?.firstName, employee?.lastName].filter(Boolean).join(' ')
        || [ldapIdentity.firstName, ldapIdentity.lastName].filter(Boolean).join(' ')
        || ldapIdentity.displayName,
      firstName: employee?.firstName ?? ldapIdentity.firstName,
      lastName: employee?.lastName ?? ldapIdentity.lastName,
      email: employee?.email ?? ldapIdentity.email ?? ldapIdentity.userPrincipalName,
      department: employee?.department ?? ldapIdentity.department,
      employeeId: employee?.code ?? ldapIdentity.employeeId,
      active: employee?.active ?? true,
      authProvider: 'ldap' as const,
    };
    const databaseIdentity = await this.identity.syncLdapLogin(profile);
    const claims: AccessClaims = {
      sub: String(databaseIdentity.userId),
      username: profile.username,
      employeeId: profile.employeeId,
      email: profile.email,
      roles: databaseIdentity.roles,
      permissions: databaseIdentity.permissions,
      provider: 'ldap',
    };
    return this.issueLogin(claims, {
      ...profile,
      userId: databaseIdentity.userId,
      roles: databaseIdentity.roles,
      permissions: databaseIdentity.permissions,
    });
  }

  async refresh(refreshToken: string) {
    const session = await this.sessions.validate(refreshToken);
    const claims = { ...session.claims } as AccessClaims;
    claims.sub = session.subject;
    claims.username = session.username;
    claims.provider = session.provider;

    // The emergency super administrator's subject is its username; database users (LDAP or local) use their numeric id.
    const isDatabaseSession = session.provider === 'ldap' || /^\d+$/.test(session.subject);
    if (session.provider === 'local' && isDatabaseSession && !this.local.enabled) {
      throw new UnauthorizedException('Local sign-in is disabled.');
    }
    if (isDatabaseSession) {
      const userId = Number(session.subject);
      const identity = Number.isSafeInteger(userId)
        ? await this.identity.getDatabaseIdentity(userId)
        : null;
      if (!identity) throw new UnauthorizedException('User account is inactive or unavailable.');
      claims.roles = identity.roles;
      claims.permissions = identity.permissions;
    } else if (this.config.get<string>('LOCAL_ADMIN_ENABLE', 'false').toLowerCase() !== 'true') {
      throw new UnauthorizedException('Local administrator access is disabled.');
    }

    const rotated = await this.sessions.rotate(session, refreshToken);
    const access = await this.signAccessToken(claims);
    return {
      status: true,
      accessToken: access.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: access.expiresIn,
      refreshToken: rotated.refreshToken,
      refreshExpiresIn: rotated.refreshExpiresIn,
      userAccess: {
        role: claims.role,
        roles: claims.roles,
        permissions: claims.permissions,
      },
    };
  }

  async logout(refreshToken: string): Promise<{ status: true }> {
    await this.sessions.revoke(refreshToken);
    return { status: true };
  }

  private async issueLogin(claims: AccessClaims, user: Record<string, unknown>) {
    const access = await this.signAccessToken(claims);
    const refresh = await this.sessions.issue({
      subject: claims.sub,
      username: claims.username,
      provider: claims.provider,
      claims,
    });
    return {
      status: true,
      message: 'Login successful.',
      accessToken: access.accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: access.expiresIn,
      refreshToken: refresh.refreshToken,
      refreshExpiresIn: refresh.refreshExpiresIn,
      user,
    };
  }

  private async signAccessToken(claims: AccessClaims) {
    const expiresIn = this.expirySeconds(this.config.get<string>('JWT_EXPIRES_IN', '1h'), 3600);
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn,
    });
    return { accessToken, expiresIn };
  }

  private expirySeconds(value: string, fallback: number): number {
    const match = value.trim().match(/^(\d+)([smhd])?$/i);
    if (!match) return fallback;
    const amount = Number(match[1]);
    const unit = (match[2] ?? 's').toLowerCase();
    return amount * ({ s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1);
  }

  private isInactive(active: string | boolean | null): boolean {
    if (active === false) return true;
    return typeof active === 'string'
      && ['0', 'no', 'false', 'inactive', 'n'].includes(active.trim().toLowerCase());
  }
}
