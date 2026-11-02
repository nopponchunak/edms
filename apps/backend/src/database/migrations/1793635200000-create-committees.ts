import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommittees1793635200000 implements MigrationInterface {
  name = 'CreateCommittees1793635200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "initial" VARCHAR(50)`);
    await queryRunner.query(`
      CREATE TABLE "committees" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "create_by" VARCHAR(100),
        "update_by" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_committees_name" ON "committees" (LOWER("name")) WHERE "deleted_at" IS NULL`);
    await queryRunner.query(`
      CREATE TABLE "committee_members" (
        "committee_id" INTEGER NOT NULL REFERENCES "committees"("id") ON DELETE CASCADE,
        "employee_id" INTEGER NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("committee_id", "employee_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_committee_members_employee" ON "committee_members" ("employee_id")`);
    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description")
      VALUES ('committees.manage', 'Manage committees', 'Create committee groups and choose their members.')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE r."code" IN ('super_admin', 'administrator') AND p."code" = 'committees.manage'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" rp USING "permissions" p WHERE rp."permission_id" = p."id" AND p."code" = 'committees.manage'`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'committees.manage'`);
    await queryRunner.query(`DROP TABLE "committee_members"`);
    await queryRunner.query(`DROP TABLE "committees"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "initial"`);
  }
}
