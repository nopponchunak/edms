import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { DesignReviewEntity } from '../design-review/entities/design-review.entity';
import { AllowanceEntity } from '../allowance-after-10pm/entities/allowance.entity';
import { CharitableContributionEntity } from '../charitable-contribution/entities/charitable-contribution.entity';
import { ExpensesClaimEntity } from '../expenses-claim/entities/expenses-claim.entity';
import { GiftOfferingEntity } from '../gift-hospitality-offering/entities/gift-hospitality-offering.entity';
import { GiftReceivingEntity } from '../gift-hospitality-receiving/entities/gift-hospitality-receiving.entity';
import { PurchaseRequisitionEntity } from '../purchase-requisition/entities/purchase-requisition.entity';

const FORM_ENTITIES = [ExpensesClaimEntity, AllowanceEntity, CharitableContributionEntity, GiftReceivingEntity, GiftOfferingEntity, PurchaseRequisitionEntity, DesignReviewEntity];

interface Signer { name: string; code: string | null }

/**
 * Keeps `signers` on every form record: the name and employee code of the creator and of each person who approved or
 * rejected a step, taken when they acted. An entry is never overwritten, so deactivating a user (or changing their
 * name) leaves signed documents exactly as they were.
 */
@Injectable()
export class SignerSnapshotSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  async afterInsert(event: InsertEvent<unknown>): Promise<void> {
    await this.snapshot(event);
  }

  async afterUpdate(event: UpdateEvent<unknown>): Promise<void> {
    await this.snapshot(event);
  }

  private async snapshot(event: InsertEvent<unknown> | UpdateEvent<unknown>): Promise<void> {
    const entity = event.entity as Record<string, unknown> | undefined;
    if (!entity || !FORM_ENTITIES.some((type) => entity instanceof type) || typeof entity['id'] !== 'number') return;

    const known = new Set(Object.keys((entity['signers'] as Record<string, Signer> | undefined) ?? {}).map((u) => u.toLowerCase()));
    const people = new Set<string>();
    const add = (username: unknown) => {
      if (typeof username === 'string' && username && !known.has(username.toLowerCase())) people.add(username.toLowerCase());
    };
    add(entity['createBy']);
    for (const key of Object.keys(entity)) {
      if (key.endsWith('By') && ['approved', 'rejected'].includes(String(entity[`${key}Status`]))) add(entity[key]);
    }
    if (!people.size) return;

    const rows: { username: string; display_name: string; code: string | null }[] = await event.manager.query(
      'SELECT username, display_name, code FROM users WHERE LOWER(username) = ANY ($1)', [[...people]],
    );
    if (!rows.length) return;
    const found = Object.fromEntries(rows.map((r) => [r.username, { name: r.display_name, code: r.code }]));
    // Existing keys win: `new || existing`.
    await event.manager.query(
      `UPDATE "${event.metadata.tableName}" SET "signers" = $1::jsonb || "signers" WHERE "id" = $2`,
      [JSON.stringify(found), entity['id']],
    );
  }
}
