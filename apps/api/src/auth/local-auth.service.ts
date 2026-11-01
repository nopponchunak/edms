import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';

@Injectable()
export class LocalAuthService {
  constructor(private readonly config: ConfigService, private readonly dataSource: DataSource) {}

  /** Whether the emergency / local sign-in is switched on (the same switch guards the super administrator). */
  get enabled(): boolean {
    return this.config.get<string>('LOCAL_ADMIN_ENABLE', 'false').toLowerCase() === 'true';
  }

  /** The username of the emergency super administrator configured in the environment. */
  get superAdminUsername(): string {
    return this.config.get<string>('LOCAL_ADMIN_USERNAME', '').trim().toLowerCase();
  }

  /** Active users stored in the database with the local provider and a password (for example test accounts). */
  async authenticateDatabaseUser(username: string, password: string) {
    if (!this.enabled) this.reject();
    const rows: { id: number; username: string; display_name: string; email: string | null; password_hash: string | null; code: string | null; department_name: string | null }[] = await this.dataSource.query(
      `SELECT u.id, u.username, u.display_name, u.email, u.password_hash, e.code, e.department_name
       FROM users u LEFT JOIN employees e ON e.id = u.employee_id
       WHERE LOWER(u.username) = LOWER($1) AND u.auth_provider = 'local' AND u.status = 'active' AND u.deleted_at IS NULL
       LIMIT 1`,
      [username.trim()],
    );
    const user = rows[0];
    // Hash something even for unknown users so the response time does not reveal which usernames exist.
    const hash = user?.password_hash ?? 'scrypt$00$00';
    const matches = await this.verifyPassword(password, hash);
    if (!user || !user.password_hash || !matches) this.reject();
    return {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      department: user.department_name,
      employeeId: user.code,
      active: true,
      authProvider: 'local' as const,
    };
  }

  async authenticate(username: string, password: string) {
    const enabled = this.config.get<string>('LOCAL_ADMIN_ENABLE', 'false').toLowerCase() === 'true';
    const configuredUsername = this.config.get<string>('LOCAL_ADMIN_USERNAME', '').trim();
    const encodedHash = this.config.get<string>('LOCAL_ADMIN_PASSWORD_HASH', '').trim();

    if (!enabled || !configuredUsername || !encodedHash) this.reject();

    const usernameMatches = username.trim().toLowerCase() === configuredUsername.toLowerCase();
    const passwordMatches = await this.verifyPassword(password, encodedHash);
    if (!usernameMatches || !passwordMatches) this.reject();

    return {
      username: configuredUsername,
      displayName: this.config.get<string>('LOCAL_ADMIN_DISPLAY_NAME', 'EDMS Super Administrator'),
      email: null,
      department: 'System Administration',
      employeeId: null,
      active: true,
      role: 'super_admin' as const,
      authProvider: 'local' as const,
    };
  }

  private async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    const [algorithm, saltHex, expectedHex] = encodedHash.split('$');
    if (algorithm !== 'scrypt' || !saltHex || !expectedHex) return false;

    try {
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(expectedHex, 'hex');
      if (!salt.length || !expected.length) return false;
      const actual = await new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, expected.length, (error, derivedKey) => {
          if (error) reject(error);
          else resolve(derivedKey);
        });
      });
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  private reject(): never {
    throw new UnauthorizedException('Invalid username or password.');
  }
}
