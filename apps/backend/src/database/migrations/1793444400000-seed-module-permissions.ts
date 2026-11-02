import { MigrationInterface, QueryRunner } from 'typeorm';

const moduleValues = `
  ('charitable-contribution', 'Charitable Contribution'),
  ('gift-hospitality-receiving', 'Gift / Hospitality Receiving'),
  ('gift-hospitality-offering', 'Gift / Hospitality Offering'),
  ('purchase-requisition', 'Purchase Requisition'),
  ('purchase-order', 'Purchase Order'),
  ('expenses-claim', 'Expenses Claim'),
  ('allowance-after-10pm', 'Allowance After 10 PM'),
  ('proposal-contract-review', 'Proposal & Contract Review'),
  ('project-quality-assurance-plan', 'Project Quality Assurance Plan'),
  ('design-review', 'Design Review'),
  ('supplier-evaluation', 'Supplier Evaluation'),
  ('project-fee-sheet', 'Project Fee Sheet'),
  ('users-access', 'Users & Access'),
  ('audit-log', 'Audit Log')
`;

export class SeedModulePermissions1793444400000 implements MigrationInterface {
  name = 'SeedModulePermissions1793444400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH modules(prefix, module_name) AS (VALUES ${moduleValues}),
      actions(suffix, action_name, action_description) AS (VALUES
        ('view', 'View', 'View the module and its records'),
        ('create', 'Create', 'Create and submit records in the module'),
        ('approve', 'Approve', 'Review and approve records in the module')
      )
      INSERT INTO "permissions" ("code", "name", "description")
      SELECT
        modules.prefix || '.' || actions.suffix,
        modules.module_name || ': ' || actions.action_name,
        actions.action_description
      FROM modules
      CROSS JOIN actions
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(`
      WITH modules(prefix) AS (VALUES
        ('charitable-contribution'), ('gift-hospitality-receiving'),
        ('gift-hospitality-offering'), ('purchase-requisition'), ('purchase-order'),
        ('expenses-claim'), ('allowance-after-10pm'), ('proposal-contract-review'),
        ('project-quality-assurance-plan'), ('design-review'), ('supplier-evaluation'),
        ('project-fee-sheet'), ('users-access'), ('audit-log')
      )
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" = 'super_admin'
        AND p."code" IN (
          SELECT modules.prefix || '.' || action.suffix
          FROM modules
          CROSS JOIN (VALUES ('view'), ('create'), ('approve')) AS action(suffix)
        )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH modules(prefix) AS (VALUES
        ('charitable-contribution'), ('gift-hospitality-receiving'),
        ('gift-hospitality-offering'), ('purchase-requisition'), ('purchase-order'),
        ('expenses-claim'), ('allowance-after-10pm'), ('proposal-contract-review'),
        ('project-quality-assurance-plan'), ('design-review'), ('supplier-evaluation'),
        ('project-fee-sheet'), ('users-access'), ('audit-log')
      ), module_permissions AS (
        SELECT modules.prefix || '.' || action.suffix AS code
        FROM modules
        CROSS JOIN (VALUES ('view'), ('create'), ('approve')) AS action(suffix)
      )
      DELETE FROM "role_permissions" rp
      USING "permissions" p, module_permissions mp
      WHERE rp."permission_id" = p."id" AND p."code" = mp.code
    `);

    await queryRunner.query(`
      WITH modules(prefix) AS (VALUES
        ('charitable-contribution'), ('gift-hospitality-receiving'),
        ('gift-hospitality-offering'), ('purchase-requisition'), ('purchase-order'),
        ('expenses-claim'), ('allowance-after-10pm'), ('proposal-contract-review'),
        ('project-quality-assurance-plan'), ('design-review'), ('supplier-evaluation'),
        ('project-fee-sheet'), ('users-access'), ('audit-log')
      )
      DELETE FROM "permissions" p
      USING modules
      WHERE p."code" IN (
        modules.prefix || '.view', modules.prefix || '.create', modules.prefix || '.approve'
      )
    `);
  }
}
