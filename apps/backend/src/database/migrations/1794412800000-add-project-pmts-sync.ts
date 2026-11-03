import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectPmtsSync1794412800000 implements MigrationInterface {
  name = 'AddProjectPmtsSync1794412800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
        ADD COLUMN "external_status" VARCHAR(50),
        ADD COLUMN "external_updated_at" TIMESTAMPTZ,
        ADD COLUMN "parent_code" VARCHAR(100),
        ADD COLUMN "synced_at" TIMESTAMPTZ
    `);
    // PMTS projects are matched by their PMTS id; a project number is the only other key.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_projects_external" ON "projects" ("source", "external_id") WHERE "external_id" IS NOT NULL`);
    await queryRunner.query(`
      CREATE TABLE "project_sync_state" (
        "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "status" VARCHAR(20) NOT NULL DEFAULT 'idle',
        "mode" VARCHAR(20),
        "started_at" TIMESTAMPTZ,
        "finished_at" TIMESTAMPTZ,
        "started_by" VARCHAR(100),
        "page" INTEGER NOT NULL DEFAULT 0,
        "total" INTEGER NOT NULL DEFAULT 0,
        "fetched" INTEGER NOT NULL DEFAULT 0,
        "created" INTEGER NOT NULL DEFAULT 0,
        "updated" INTEGER NOT NULL DEFAULT 0,
        "unchanged" INTEGER NOT NULL DEFAULT 0,
        "linked" INTEGER NOT NULL DEFAULT 0,
        "skipped" INTEGER NOT NULL DEFAULT 0,
        "deactivated" INTEGER NOT NULL DEFAULT 0,
        "message" TEXT,
        "watermark" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`INSERT INTO "project_sync_state" ("id") VALUES (1)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "project_sync_state"`);
    await queryRunner.query(`DROP INDEX "UQ_projects_external"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP COLUMN "synced_at", DROP COLUMN "parent_code", DROP COLUMN "external_updated_at", DROP COLUMN "external_status"`);
  }
}
