import { BadRequestException } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';

/** Body of `POST :id/reassign`: give a step that is still waiting to someone else (administrators only). */
export class ReassignDto {
  @IsNotEmpty() @IsString() @MaxLength(50) step!: string;
  @IsNotEmpty() @IsString() @MaxLength(100) username!: string;
}

/** The new person must be an active user who can open the form. */
export async function assertCanTakeStep(dataSource: DataSource, username: string, viewPermission: string): Promise<void> {
  const rows: unknown[] = await dataSource.query(
    `SELECT 1 FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id AND p.code = $2
     WHERE LOWER(u.username) = LOWER($1) AND u.status = 'active' AND u.deleted_at IS NULL AND (u.is_super_admin OR p.id IS NOT NULL) LIMIT 1`,
    [username, viewPermission],
  );
  if (!rows.length) throw new BadRequestException(`${username} is not an active user with access to this form.`);
}
