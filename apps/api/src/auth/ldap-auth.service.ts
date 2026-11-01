import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ldapts';

export interface LdapIdentity {
  username: string;
  userPrincipalName: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  department: string | null;
  employeeId: string | null;
}

@Injectable()
export class LdapAuthService {
  private readonly logger = new Logger(LdapAuthService.name);

  constructor(private readonly config: ConfigService) {}

  async authenticate(rawUsername: string, password: string): Promise<LdapIdentity> {
    if (this.config.get<string>('LDAP_ENABLE', 'false').toLowerCase() !== 'true') {
      throw new ServiceUnavailableException('LDAP authentication is disabled.');
    }

    const username = rawUsername.trim();
    const url = this.required('LDAP_URL').replace('ldap\\://', 'ldap://');
    const allowInsecure = this.config.get<string>('LDAP_ALLOW_INSECURE', 'false').toLowerCase() === 'true';
    if (url.startsWith('ldap://') && !allowInsecure) {
      throw new ServiceUnavailableException('Plain LDAP requires LDAP_ALLOW_INSECURE=true.');
    }

    const client = new Client({
      url,
      connectTimeout: this.numberConfig('LDAP_CONNECT_TIMEOUT_MS', 5000),
      timeout: this.numberConfig('LDAP_TIMEOUT_MS', 5000),
      tlsOptions: url.startsWith('ldaps://') ? { rejectUnauthorized: !allowInsecure } : undefined,
    });
    let phase: 'service' | 'search' | 'user' = 'service';

    try {
      await client.bind(this.required('LDAP_DN'), this.required('LDAP_PASSWORD'));
      phase = 'search';

      const filterTemplate = this.config.get<string>('LDAP_FILTER', '(sAMAccountName={{username}})');
      if (!filterTemplate.includes('{{username}}')) {
        throw new ServiceUnavailableException('LDAP_FILTER must contain {{username}}.');
      }
      const filter = filterTemplate.replaceAll('{{username}}', this.escapeFilterValue(username));
      const searchAttribute = this.config.get<string>('LDAP_SEARCH', 'sAMAccountName');
      const { searchEntries } = await client.search(this.required('LDAP_BASE'), {
        scope: 'sub',
        filter,
        sizeLimit: 2,
        timeLimit: Math.max(1, Math.ceil(this.numberConfig('LDAP_TIMEOUT_MS', 5000) / 1000)),
        attributes: [searchAttribute, 'userPrincipalName', 'displayName', 'givenName', 'sn', 'mail', 'department', 'employeeID', 'employeeNumber'],
      });

      if (searchEntries.length !== 1 || !searchEntries[0].dn) {
        this.logger.warn(`LDAP login rejected for "${username}": directory search matched ${searchEntries.length} entries (expected 1).`);
        throw new UnauthorizedException('Invalid username or password.');
      }

      const entry = searchEntries[0];
      phase = 'user';
      await client.bind(entry.dn, password);

      const resolvedUsername = this.attribute(entry, searchAttribute) ?? username;
      return {
        username: resolvedUsername,
        userPrincipalName: this.attribute(entry, 'userPrincipalName'),
        displayName: this.attribute(entry, 'displayName') ?? resolvedUsername,
        firstName: this.attribute(entry, 'givenName'),
        lastName: this.attribute(entry, 'sn'),
        email: this.attribute(entry, 'mail'),
        department: this.attribute(entry, 'department'),
        employeeId: this.attribute(entry, 'employeeID') ?? this.attribute(entry, 'employeeNumber'),
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof ServiceUnavailableException) throw error;
      if (phase === 'user') {
        this.logger.warn(`LDAP login rejected for "${username}": user bind failed (wrong password or locked account).`);
        throw new UnauthorizedException('Invalid username or password.');
      }
      this.logger.error(`LDAP ${phase} operation failed.`);
      throw new ServiceUnavailableException('LDAP service is unavailable.');
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new ServiceUnavailableException(`Missing LDAP configuration: ${key}.`);
    return value;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private escapeFilterValue(value: string): string {
    return value.replace(/[\\*()\u0000]/g, (character) => {
      const replacements: Record<string, string> = { '\\': '\\5c', '*': '\\2a', '(': '\\28', ')': '\\29', '\u0000': '\\00' };
      return replacements[character];
    });
  }

  private attribute(entry: Record<string, unknown>, name: string): string | null {
    const key = Object.keys(entry).find((item) => item.toLowerCase() === name.toLowerCase());
    const value = key ? entry[key] : undefined;
    if (Array.isArray(value)) return value.length ? String(value[0]) : null;
    return typeof value === 'string' ? value : null;
  }
}
