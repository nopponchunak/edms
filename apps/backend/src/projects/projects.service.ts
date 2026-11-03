import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { rowsOf } from './query-rows';

export interface ProjectRow {
  id: number;
  projectNo: string;
  name: string;
  status: 'active' | 'inactive';
  source: string;
  externalId: string | null;
  /** The project's status in PMTS (information only; it does not decide whether the project can be used here). */
  externalStatus: string | null;
  label: string;
}

const COLUMNS = `p.id, p.project_no AS "projectNo", p.name, p.status, p.source, p.external_id AS "externalId", p.external_status AS "externalStatus"`;
const withLabel = (r: Omit<ProjectRow, 'label'>): ProjectRow => ({ ...r, label: `${r.projectNo} - ${r.name}` });

/** Master data: projects, typed in by hand or copied from PMTS (`source` = manual / pmts, `external_id` = the PMTS id). */
@Injectable()
export class ProjectsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(q?: string, includeInactive = true): Promise<ProjectRow[]> {
    const search = q?.trim().slice(0, 100);
    const rows = await this.dataSource.query(
      `SELECT ${COLUMNS} FROM projects p
       WHERE p.deleted_at IS NULL AND ($1::boolean OR p.status = 'active')
         AND ($2::text IS NULL OR p.project_no ILIKE $2 OR p.name ILIKE $2)
       ORDER BY p.project_no LIMIT 20000`,
      [includeInactive, search ? `%${search}%` : null],
    );
    return rows.map(withLabel);
  }

  async create(projectNo: string, name: string, actor: string): Promise<ProjectRow> {
    await this.assertNumberFree(projectNo);
    const rows = await this.dataSource.query(
      `INSERT INTO projects (project_no, name, create_by, update_by) VALUES ($1, $2, $3, $3)
       RETURNING id, project_no AS "projectNo", name, status, source, external_id AS "externalId", external_status AS "externalStatus"`,
      [projectNo.trim(), name.trim(), actor],
    );
    return withLabel(rows[0]);
  }

  async update(id: number, projectNo: string, name: string, status: 'active' | 'inactive', actor: string): Promise<ProjectRow> {
    await this.findOne(id);
    await this.assertNumberFree(projectNo, id);
    // A project that comes from PMTS keeps PMTS's number and name (the next sync would overwrite them); only its status is ours.
    const rows = rowsOf(await this.dataSource.query(
      `UPDATE projects SET project_no = CASE WHEN source = 'pmts' THEN project_no ELSE $2 END, name = CASE WHEN source = 'pmts' THEN name ELSE $3 END,
         status = $4, update_by = $5, updated_at = now() WHERE id = $1
       RETURNING id, project_no AS "projectNo", name, status, source, external_id AS "externalId", external_status AS "externalStatus"`,
      [id, projectNo.trim(), name.trim(), status, actor],
    ));
    return withLabel(rows[0]);
  }

  private async findOne(id: number) {
    const rows = await this.dataSource.query(`SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rows.length) throw new NotFoundException('Project not found');
  }

  private async assertNumberFree(projectNo: string, exceptId?: number) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM projects WHERE LOWER(project_no) = LOWER($1) AND deleted_at IS NULL AND ($2::int IS NULL OR id <> $2)`,
      [projectNo.trim(), exceptId ?? null],
    );
    if (rows.length) throw new ConflictException('A project with this number already exists');
  }
}
