import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantAdministratorPermissions1793352600000
  implements MigrationInterface
{
  name = 'GrantAdministratorPermissions1793352600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" = 'administrator'
        AND p."code" IN ('applications.view', 'users.manage', 'roles.manage')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."id"
        AND rp."permission_id" = p."id"
        AND r."code" = 'administrator'
        AND p."code" IN ('applications.view', 'users.manage', 'roles.manage')
    `);
  }
}
