import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowDuplicateUserEmails1793451600000 implements MigrationInterface {
  name = 'AllowDuplicateUserEmails1793451600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_email_lookup" ON "users" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email_lookup"`);
    await queryRunner.query(`
      UPDATE "users" target
      SET "email" = NULL
      WHERE target."email" IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "users" keeper
          WHERE lower(keeper."email") = lower(target."email")
            AND keeper."id" < target."id"
        )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`);
  }
}
