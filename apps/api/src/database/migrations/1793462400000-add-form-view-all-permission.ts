import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormViewAllPermission1793462400000 implements MigrationInterface {
  name = 'AddFormViewAllPermission1793462400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description") VALUES
        ('expenses-claim.view-all', 'Expenses Claim: View all records', 'See every expenses claim, not only those you take part in'),
        ('allowance-after-10pm.view-all', 'Allowance After 10 PM: View all records', 'See every allowance request, not only those you take part in')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" IN ('super_admin', 'administrator', 'accounting_admins')
        AND p."code" IN ('expenses-claim.view-all', 'allowance-after-10pm.view-all')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "permissions" p
      WHERE rp."permission_id" = p."id" AND p."code" IN ('expenses-claim.view-all', 'allowance-after-10pm.view-all')
    `);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('expenses-claim.view-all', 'allowance-after-10pm.view-all')`);
  }
}
