import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { EmployeeEntity } from '../identity/entities/employee.entity';
import { PermissionEntity } from '../identity/entities/permission.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { AuditLogEntity } from '../access/entities/audit-log.entity';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity';

for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'edms',
  password: process.env.DB_PASSWORD ?? 'edms_dev_password',
  database: process.env.DB_NAME ?? 'edms',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  synchronize: false,
  entities: [EmployeeEntity, UserEntity, RoleEntity, PermissionEntity, AuditLogEntity, AuthSessionEntity],
  migrations: [resolve(__dirname, 'migrations/*{.ts,.js}')],
});
