import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PmtsClient, PmtsProject } from './pmts.client';
import { rowsOf } from './query-rows';

export type SyncMode = 'incremental' | 'full';

export interface SyncState {
  status: 'idle' | 'running' | 'success' | 'failed';
  mode: SyncMode | null;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  page: number;
  pages: number;
  total: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  linked: number;
  skipped: number;
  deactivated: number;
  message: string | null;
  /** When the last successful run began; the next incremental run asks PMTS for changes since then. */
  watermark: string | null;
  configured: boolean;
}

const PAGE_SIZE = 500;
/**
 * Copies projects from PMTS into the `projects` master data (read-only on the PMTS side). It runs in the background:
 * the first run is a full copy and takes a while, later runs only ask for what changed (`updatedSince`).
 * Projects are matched on the PMTS id; a hand-typed project with the same number is linked, not duplicated.
 * A project closed in PMTS stays usable here: the sync keeps PMTS's status for information only and never changes
 * whether a project is active in EDMS (people do that on the Projects page). A project that disappears from PMTS is
 * only marked, never deleted or switched off.
 */
@Injectable()
export class ProjectsSyncService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsSyncService.name);

  constructor(private readonly dataSource: DataSource, private readonly pmts: PmtsClient) {}

  /** A run cut short by a restart would stay "running" for ever. */
  async onModuleInit(): Promise<void> {
    await this.dataSource.query(
      `UPDATE project_sync_state SET status = 'failed', finished_at = now(), message = 'Interrupted by a restart of the server.' WHERE status = 'running'`,
    ).catch(() => undefined);
  }

  async state(): Promise<SyncState> {
    const rows = await this.dataSource.query(`SELECT * FROM project_sync_state WHERE id = 1`);
    const r = rows[0];
    return {
      status: r.status, mode: r.mode, startedAt: r.started_at, finishedAt: r.finished_at, startedBy: r.started_by,
      page: r.page, pages: Math.ceil(r.total / PAGE_SIZE), total: r.total, fetched: r.fetched, created: r.created, updated: r.updated,
      unchanged: r.unchanged, linked: r.linked, skipped: r.skipped, deactivated: r.deactivated, message: r.message,
      watermark: r.watermark, configured: this.pmts.isConfigured(),
    };
  }

  /** Starts a run and returns at once; poll `state()` for progress. */
  async start(mode: SyncMode, actor: string): Promise<SyncState> {
    if (!this.pmts.isConfigured()) throw new BadRequestException('PMTS is not configured (set PMTS_API_KEY).');
    const before = await this.state();
    // An incremental run needs a previous full copy to build on.
    const effective: SyncMode = mode === 'incremental' && before.watermark ? 'incremental' : 'full';
    const claimed = rowsOf<{ started_at: string }>(await this.dataSource.query(
      `UPDATE project_sync_state SET status = 'running', mode = $1, started_at = now(), finished_at = NULL, started_by = $2, page = 0, total = 0,
         fetched = 0, created = 0, updated = 0, unchanged = 0, linked = 0, skipped = 0, deactivated = 0, message = NULL
       WHERE id = 1 AND status <> 'running' RETURNING started_at`,
      [effective, actor],
    ));
    if (!claimed.length) throw new ConflictException('A sync is already running.');
    void this.run(effective, new Date(claimed[0].started_at), before.watermark);
    return this.state();
  }

  /** The whole run; never throws (a failure is written to the state). */
  async run(mode: SyncMode, startedAt: Date, watermark: string | null): Promise<void> {
    const counts = { fetched: 0, created: 0, updated: 0, unchanged: 0, linked: 0, skipped: 0 };
    try {
      let page = 1;
      let total = Infinity;
      let firstGeneratedAt: string | null = null;
      while ((page - 1) * PAGE_SIZE < total) {
        const result = await this.pmts.fetchProjects(page, PAGE_SIZE, mode === 'incremental' ? watermark : null);
        firstGeneratedAt ??= result.generatedAt;
        total = result.total;
        await this.dataSource.transaction((em) => this.applyPage(em, result.projects, counts));
        counts.fetched += result.projects.length;
        await this.dataSource.query(
          `UPDATE project_sync_state SET page = $1, total = $2, fetched = $3, created = $4, updated = $5, unchanged = $6, linked = $7, skipped = $8 WHERE id = 1`,
          [page, total, counts.fetched, counts.created, counts.updated, counts.unchanged, counts.linked, counts.skipped],
        );
        page += 1;
      }
      // A full copy also tells us what is gone from PMTS (it sends no deletions): those are marked, nothing else changes.
      let deactivated = 0;
      if (mode === 'full') {
        const gone = rowsOf(await this.dataSource.query(
          `UPDATE projects SET external_status = 'not in PMTS', updated_at = now()
           WHERE source = 'pmts' AND deleted_at IS NULL AND (synced_at IS NULL OR synced_at < $1) AND external_status IS DISTINCT FROM 'not in PMTS' RETURNING id`,
          [startedAt],
        ));
        deactivated = gone.length;
      }
      await this.dataSource.query(
        `UPDATE project_sync_state SET status = 'success', finished_at = now(), deactivated = $1, watermark = $2,
           message = $3 WHERE id = 1`,
        [deactivated, firstGeneratedAt, counts.skipped ? `${counts.skipped} project(s) skipped because their number is already used by another project.` : null],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Project sync failed: ${message}`);
      await this.dataSource.query(`UPDATE project_sync_state SET status = 'failed', finished_at = now(), message = $1 WHERE id = 1`, [message.slice(0, 500)]);
    }
  }

  private async applyPage(em: { query: (sql: string, params?: unknown[]) => Promise<any[]> }, rows: PmtsProject[], counts: Record<string, number>) {
    const usable = rows.filter((r) => r.id && r.code?.trim() && r.name?.trim());
    counts['skipped'] += rows.length - usable.length;
    const ids = usable.map((r) => r.id);
    const codes = usable.map((r) => r.code.trim().toLowerCase());
    const byExternal = new Map<string, any>(
      (await em.query(`SELECT * FROM projects WHERE source = 'pmts' AND external_id = ANY ($1)`, [ids])).map((r: any) => [r.external_id, r]),
    );
    const byCode = new Map<string, any>(
      (await em.query(`SELECT * FROM projects WHERE deleted_at IS NULL AND LOWER(project_no) = ANY ($1)`, [codes])).map((r: any) => [r.project_no.toLowerCase(), r]),
    );

    for (const p of usable) {
      const code = p.code.trim();
      const name = p.name.trim();
      const values = [code, name, p.status ?? null, p.parentCode ?? null, p.updatedAt ?? null];
      const owner = byCode.get(code.toLowerCase());
      const existing = byExternal.get(p.id);

      if (existing) {
        if (owner && owner.id !== existing.id) { counts['skipped'] += 1; continue; }
        const same = existing.project_no === code && existing.name === name && existing.external_status === (p.status ?? null)
          && existing.parent_code === (p.parentCode ?? null);
        if (same) {
          counts['unchanged'] += 1;
          await em.query(`UPDATE projects SET synced_at = now() WHERE id = $1`, [existing.id]);
        } else {
          counts['updated'] += 1;
          await em.query(
            `UPDATE projects SET project_no = $2, name = $3, external_status = $4, parent_code = $5, external_updated_at = $6,
               synced_at = now(), updated_at = now(), update_by = 'pmts-sync' WHERE id = $1`,
            [existing.id, ...values],
          );
        }
        byCode.set(code.toLowerCase(), { ...existing, project_no: code });
        continue;
      }
      if (owner) {
        if (owner.source === 'manual' && !owner.external_id) {
          // A project typed in by hand: take it over instead of creating a second one.
          counts['linked'] += 1;
          await em.query(
            `UPDATE projects SET source = 'pmts', external_id = $2, name = $3, external_status = $4, parent_code = $5, external_updated_at = $6,
               synced_at = now(), updated_at = now(), update_by = 'pmts-sync' WHERE id = $1`,
            [owner.id, p.id, name, p.status ?? null, p.parentCode ?? null, p.updatedAt ?? null],
          );
          byExternal.set(p.id, { ...owner, external_id: p.id });
        } else {
          counts['skipped'] += 1;
        }
        continue;
      }
      counts['created'] += 1;
      const inserted = await em.query(
        `INSERT INTO projects (project_no, name, status, external_status, parent_code, external_updated_at, source, external_id, synced_at, create_by, update_by)
         VALUES ($1, $2, 'active', $3, $4, $5, 'pmts', $6, now(), 'pmts-sync', 'pmts-sync') RETURNING *`,
        [...values, p.id],
      );
      byCode.set(code.toLowerCase(), inserted[0]);
      byExternal.set(p.id, inserted[0]);
    }
  }
}
