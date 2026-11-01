import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HrisEmployeeProfile {
  code: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  department: string | null;
  initial: string | null;
  title: string | null;
  level: string | null;
  active: string | boolean | null;
}

@Injectable()
export class HrisEmployeeService {
  private readonly logger = new Logger(HrisEmployeeService.name);
  private cache: { expiresAt: number; employees: Record<string, unknown>[] } | null = null;

  constructor(private readonly config: ConfigService) {}

  async listAll(): Promise<HrisEmployeeProfile[]> {
    const endpoint = this.config.get<string>('HRIS_EMPLOYEE_URL')?.trim();
    if (!endpoint) return [];
    const employees = await this.loadEmployees(endpoint);
    return employees.map((employee) => this.profile(employee)).filter((employee): employee is HrisEmployeeProfile => employee !== null);
  }

  async findByUsername(username: string): Promise<HrisEmployeeProfile | null> {
    const endpoint = this.config.get<string>('HRIS_EMPLOYEE_URL')?.trim();
    if (!endpoint) return null;

    try {
      const employees = await this.loadEmployees(endpoint);
      const needle = username.toLowerCase();
      const employee = employees.find((item) => {
        const account = this.text(item.username)?.toLowerCase();
        const email = this.text(item.email)?.toLowerCase();
        return account === needle || email === needle;
      });
      if (!employee) return null;

      return this.profile(employee);
    } catch {
      this.logger.warn('HRIS profile enrichment is unavailable; LDAP login will continue.');
      return null;
    }
  }

  private async loadEmployees(endpoint: string): Promise<Record<string, unknown>[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.employees;
    const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HRIS returned ${response.status}`);
    const payload: unknown = await response.json();
    const employees = this.employeeArray(payload);
    this.cache = { employees, expiresAt: Date.now() + 5 * 60 * 1000 };
    return employees;
  }

  private employeeArray(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) return payload.filter(this.isObject);
    const root = this.object(payload);
    if (!root) return [];
    if (Array.isArray(root.data)) return root.data.filter(this.isObject);
    const nested = this.object(root.data);
    return nested && Array.isArray(nested.data) ? nested.data.filter(this.isObject) : [];
  }

  private profile(employee: Record<string, unknown>): HrisEmployeeProfile | null {
    const code = this.text(employee.code);
    const username = this.text(employee.username);
    if (!code && !username) return null;
    const department = this.object(employee.department);
    return {
      code,
      username,
      firstName: this.text(employee.firstname),
      lastName: this.text(employee.lastname),
      email: this.text(employee.email),
      initial: this.text(employee.initial),
      title: this.object(employee.title) ? this.text(this.object(employee.title)!.name) : this.text(employee.title),
      level: this.object(employee.level) ? this.text(this.object(employee.level)!.name) : this.text(employee.level),
      department: department ? this.text(department.name) : this.text(employee.department_name),
      active: typeof employee.active === 'boolean' ? employee.active : this.text(employee.active),
    };
  }

  private readonly isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  private object(value: unknown): Record<string, unknown> | null { return this.isObject(value) ? value : null; }
  private text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
}
