import { MigrationInterface, QueryRunner } from 'typeorm';

interface LegacyRoleMapping {
  code: string;
  name: string;
  legacyNames: string[];
  permissions: string[];
}

const legacyRoleMappings: LegacyRoleMapping[] = [
  {
    code: 'special_admin', name: 'Special Admin', legacyNames: ['Special Admin'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'executive', name: 'Executive', legacyNames: ['Excutive'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'project-fee-sheet.view', 'project-fee-sheet.create', 'project-quality-assurance-plan.view', 'project-quality-assurance-plan.create', 'proposal-contract-review.view', 'proposal-contract-review.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'hr', name: 'HR', legacyNames: ['HR'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'administrative', name: 'Administrative', legacyNames: ['Administrative'],
    permissions: ['gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'secretary_admins', name: 'Secretary Admins', legacyNames: ['Secreary Admins'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'all_staff', name: 'All Staff', legacyNames: ['ALL STAFF'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'engineers', name: 'Engineers', legacyNames: ['Enigneers'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'di_md', name: 'DI-MD', legacyNames: ['DI-MD'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-order.view', 'purchase-order.create', 'purchase-requisition.view', 'purchase-requisition.create', 'supplier-evaluation.view', 'supplier-evaluation.create'],
  },
  {
    code: 'ad_tl', name: 'AD-TL', legacyNames: ['AD-TL'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create', 'supplier-evaluation.view', 'supplier-evaluation.create'],
  },
  {
    code: 'accounting_admins', name: 'Accounting Admins', legacyNames: ['Accounting Admins'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-order.view', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'purchasing', name: 'Purchasing', legacyNames: ['Purchasing (ID 18)', 'Purchasing (ID 11)'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-order.view', 'purchase-order.create', 'purchase-requisition.view', 'purchase-requisition.create', 'supplier-evaluation.view', 'supplier-evaluation.create'],
  },
  {
    code: 'secretary_2', name: 'Secretary 2', legacyNames: ['Secretary 2'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'expenses-claim.view', 'expenses-claim.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'secretary_1', name: 'Secretary 1', legacyNames: ['Secretary 1'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'expenses-claim.view', 'expenses-claim.create', 'project-fee-sheet.view', 'project-fee-sheet.create', 'project-quality-assurance-plan.view', 'project-quality-assurance-plan.create', 'proposal-contract-review.view', 'proposal-contract-review.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'staff', name: 'Staff', legacyNames: ['Satff'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'it', name: 'IT', legacyNames: ['IT'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'purchase_admins', name: 'Purchase Admins', legacyNames: ['Purchase Admins'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-order.view', 'purchase-order.create', 'purchase-requisition.view', 'purchase-requisition.create', 'supplier-evaluation.view', 'supplier-evaluation.create'],
  },
  {
    code: 'secretary', name: 'Secretary', legacyNames: ['Secretary'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'project-fee-sheet.view', 'project-fee-sheet.create', 'project-quality-assurance-plan.view', 'project-quality-assurance-plan.create', 'proposal-contract-review.view', 'proposal-contract-review.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'ims', name: 'IMS', legacyNames: ['IMS'],
    permissions: ['allowance-after-10pm.view', 'allowance-after-10pm.create', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'expenses-claim.create', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'purchase-requisition.view', 'purchase-requisition.create'],
  },
  {
    code: 'employee', name: 'Employee', legacyNames: ['EMPLOYEE'],
    permissions: ['allowance-after-10pm.view', 'charitable-contribution.view', 'charitable-contribution.create', 'design-review.view', 'design-review.create', 'expenses-claim.view', 'gift-hospitality-offering.view', 'gift-hospitality-offering.create', 'gift-hospitality-receiving.view', 'gift-hospitality-receiving.create', 'project-fee-sheet.view', 'project-quality-assurance-plan.view', 'proposal-contract-review.view', 'supplier-evaluation.view'],
  },
];

const createdRoleCodes = legacyRoleMappings
  .map((mapping) => mapping.code)
  .filter((code) => code !== 'employee');

export class MapLegacyRoles1793448000000 implements MigrationInterface {
  name = 'MapLegacyRoles1793448000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const mapping of legacyRoleMappings) {
      if (mapping.code !== 'employee') {
        await queryRunner.query(
          `INSERT INTO "roles" ("code", "name", "description", "is_system")
           VALUES ($1, $2, $3, false)
           ON CONFLICT ("code") DO NOTHING`,
          [mapping.code, mapping.name, `Mapped from legacy role: ${mapping.legacyNames.join(' + ')}`],
        );
      }

      await queryRunner.query(
        `INSERT INTO "role_permissions" ("role_id", "permission_id")
         SELECT r."id", p."id"
         FROM "roles" r
         CROSS JOIN "permissions" p
         WHERE r."code" = $1 AND p."code" = ANY($2::varchar[])
         ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
        [mapping.code, mapping.permissions],
      );
    }

    await queryRunner.query(`
      DELETE FROM "role_permissions" rp
      USING "roles" r, "permissions" p
      WHERE rp."role_id" = r."id"
        AND rp."permission_id" = p."id"
        AND r."code" = 'employee'
        AND p."code" = 'applications.view'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const employeePermissions = legacyRoleMappings.find((mapping) => mapping.code === 'employee')?.permissions ?? [];
    await queryRunner.query(
      `DELETE FROM "role_permissions" rp
       USING "roles" r, "permissions" p
       WHERE rp."role_id" = r."id"
         AND rp."permission_id" = p."id"
         AND r."code" = 'employee'
         AND p."code" = ANY($1::varchar[])`,
      [employeePermissions],
    );
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r."id", p."id"
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r."code" = 'employee' AND p."code" = 'applications.view'
      ON CONFLICT ("role_id", "permission_id") DO NOTHING
    `);
    await queryRunner.query(
      `DELETE FROM "roles" WHERE "code" = ANY($1::varchar[])`,
      [createdRoleCodes],
    );
  }
}
