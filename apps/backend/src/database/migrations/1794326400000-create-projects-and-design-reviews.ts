import { MigrationInterface, QueryRunner } from 'typeorm';

const STEPS = ['review', 'respond', 'tl', 'tl2', 'ack'];

export class CreateProjectsAndDesignReviews1794326400000 implements MigrationInterface {
  name = 'CreateProjectsAndDesignReviews1794326400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Master data: projects. `source` / `external_id` leave room for a later import from another system.
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" SERIAL PRIMARY KEY,
        "project_no" VARCHAR(100) NOT NULL,
        "name" VARCHAR(500) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        "source" VARCHAR(30) NOT NULL DEFAULT 'manual',
        "external_id" VARCHAR(100),
        "create_by" VARCHAR(100),
        "update_by" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ,
        CONSTRAINT "CHK_projects_status" CHECK ("status" IN ('active', 'inactive'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_projects_no" ON "projects" (LOWER("project_no")) WHERE "deleted_at" IS NULL`);

    const stepColumns = STEPS.map((s) => `"${s}_by" VARCHAR(100), "${s}_by_status" VARCHAR(50), "${s}_by_date" TIMESTAMPTZ, "${s}_comment" TEXT`).join(',\n        ');
    await queryRunner.query(`
      CREATE TABLE "design_reviews" (
        "id" SERIAL PRIMARY KEY,
        "form_type" VARCHAR(20) NOT NULL DEFAULT 'mtdd01',
        "voucher_no" VARCHAR(100) UNIQUE,
        "project_id" INTEGER REFERENCES "projects"("id"),
        "project_no" VARCHAR(100),
        "project_name" VARCHAR(500),
        "prepared_by" VARCHAR(255) NOT NULL,
        "discipline" VARCHAR(100),
        "discipline_other" VARCHAR(255),
        "stage" VARCHAR(255),
        "document_types" JSONB NOT NULL DEFAULT '[]',
        "document_types_other" VARCHAR(255),
        "document_location" VARCHAR(500),
        "checklist" JSONB NOT NULL DEFAULT '[]',
        "comments" TEXT,
        "recommended_actions" TEXT,
        "actions_taken" BOOLEAN,
        "action_note" TEXT,
        "attachments" JSONB,
        ${stepColumns},
        "version" INTEGER NOT NULL DEFAULT 0,
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "form_version" INTEGER NOT NULL DEFAULT 1,
        "signers" JSONB NOT NULL DEFAULT '{}',
        "create_by" VARCHAR(100),
        "update_by" VARCHAR(100),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "design_review_events" (
        "id" SERIAL PRIMARY KEY,
        "record_id" INTEGER NOT NULL REFERENCES "design_reviews"("id") ON DELETE CASCADE,
        "version" INTEGER NOT NULL,
        "action" VARCHAR(30) NOT NULL,
        "step" VARCHAR(20),
        "actor" VARCHAR(100) NOT NULL,
        "comment" TEXT,
        "snapshot" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_dr_events_record" ON "design_review_events" ("record_id", "created_at")`);

    await queryRunner.query(`
      INSERT INTO "permissions" ("code", "name", "description") VALUES
        ('projects.manage', 'Projects: Manage', 'Create, edit and deactivate projects (Master Data)'),
        ('design-review.view-all', 'Design Review: View all records', 'See every design review, not only those you take part in')
      ON CONFLICT ("code") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
      WHERE (r."code" IN ('super_admin', 'administrator') AND p."code" = 'projects.manage')
         OR (r."code" IN ('super_admin', 'administrator', 'accounting_admins') AND p."code" = 'design-review.view-all')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_permissions" rp USING "permissions" p WHERE rp."permission_id" = p."id" AND p."code" IN ('projects.manage', 'design-review.view-all')`);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('projects.manage', 'design-review.view-all')`);
    await queryRunner.query(`DROP TABLE "design_review_events"`);
    await queryRunner.query(`DROP TABLE "design_reviews"`);
    await queryRunner.query(`DROP TABLE "projects"`);
  }
}
