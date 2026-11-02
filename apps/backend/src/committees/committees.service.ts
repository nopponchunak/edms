import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PR_ROLE_SQL, PrRoleKind } from '../purchase-requisition/purchase-requisition.roles';

export interface EmployeeOption {
  id: number;
  code: string | null;
  username: string | null;
  initial: string | null;
  title: string | null;
  level: string | null;
  name: string;
  /** "initial, First Last" — the single display format used by every dropdown. */
  label: string;
}

interface EmployeeRow {
  id: number;
  code: string | null;
  username: string | null;
  initial: string | null;
  title_name: string | null;
  level_name: string | null;
  firstname: string;
  lastname: string;
}

const EMPLOYEE_COLUMNS = 'e.id, e.code, e.username, e.initial, e.title_name, e.level_name, e.firstname, e.lastname';
const ACTIVE_EMPLOYEE = `e.deleted_at IS NULL AND COALESCE(e.employee_status, 'active') = 'active'`;
const EMPLOYEE_MATCH = (param: string) =>
  `(${param}::text IS NULL OR e.initial ILIKE ${param} OR e.title_name ILIKE ${param} OR e.code ILIKE ${param} OR e.firstname ILIKE ${param} OR e.lastname ILIKE ${param} OR (e.firstname || ' ' || e.lastname) ILIKE ${param})`;

export function employeeOption(row: EmployeeRow): EmployeeOption {
  const name = `${row.firstname} ${row.lastname}`.replace(/\s+-$/, '').trim();
  const initial = row.initial?.trim() || null;
  return { id: row.id, code: row.code, username: row.username, initial, title: row.title_name, level: row.level_name, name, label: initial ? `${initial}, ${name}` : name };
}

@Injectable()
export class CommitteesService {
  constructor(private readonly dataSource: DataSource) {}

  async list() {
    return this.dataSource.query(`
      SELECT c.id, c.name, c.description, c.updated_at AS "updatedAt",
             (SELECT COUNT(*)::int FROM committee_members m JOIN employees e ON e.id = m.employee_id
               WHERE m.committee_id = c.id AND ${ACTIVE_EMPLOYEE}) AS "memberCount"
      FROM committees c
      WHERE c.deleted_at IS NULL
      ORDER BY LOWER(c.name)
    `);
  }

  async create(name: string, description: string | undefined, actor: string) {
    await this.assertNameFree(name);
    const rows = await this.dataSource.query(
      `INSERT INTO committees (name, description, create_by, update_by) VALUES ($1, $2, $3, $3) RETURNING id, name, description`,
      [name.trim(), description?.trim() || null, actor],
    );
    return { ...rows[0], memberCount: 0 };
  }

  async update(id: number, name: string, description: string | undefined, actor: string) {
    await this.findOne(id);
    await this.assertNameFree(name, id);
    await this.dataSource.query(
      `UPDATE committees SET name = $2, description = $3, update_by = $4, updated_at = now() WHERE id = $1`,
      [id, name.trim(), description?.trim() || null, actor],
    );
    return this.findOne(id);
  }

  async remove(id: number, actor: string) {
    await this.findOne(id);
    await this.dataSource.query(`UPDATE committees SET deleted_at = now(), update_by = $2 WHERE id = $1`, [id, actor]);
    return { message: 'Deleted' };
  }

  async members(id: number): Promise<EmployeeOption[]> {
    await this.findOne(id);
    return this.queryMembers(id);
  }

  async setMembers(id: number, employeeIds: number[], actor: string) {
    await this.findOne(id);
    const ids = [...new Set(employeeIds)];
    if (ids.length) {
      const found: { id: number }[] = await this.dataSource.query(
        `SELECT e.id FROM employees e WHERE e.id = ANY($1::int[]) AND e.deleted_at IS NULL`, [ids],
      );
      if (found.length !== ids.length) throw new BadRequestException('Some selected employees were not found');
    }
    await this.dataSource.transaction(async (em) => {
      await em.query(`DELETE FROM committee_members WHERE committee_id = $1`, [id]);
      if (ids.length) {
        await em.query(`INSERT INTO committee_members (committee_id, employee_id) SELECT $1, UNNEST($2::int[])`, [id, ids]);
      }
      await em.query(`UPDATE committees SET update_by = $2, updated_at = now() WHERE id = $1`, [id, actor]);
    });
    return this.queryMembers(id);
  }

  /** Members of a committee (by id or exact name) formatted for a form dropdown. */
  async dropdown(ref: string, q?: string): Promise<EmployeeOption[]> {
    const committee: { id: number }[] = /^\d+$/.test(ref)
      ? await this.dataSource.query(`SELECT id FROM committees WHERE id = $1 AND deleted_at IS NULL`, [Number(ref)])
      : await this.dataSource.query(`SELECT id FROM committees WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`, [ref]);
    if (!committee.length) throw new NotFoundException('Committee not found');
    return this.queryMembers(committee[0].id, q);
  }

  /** Active employees whose Title / Level fits a role (e.g. the IT manager), formatted for a form dropdown. */
  async roleDropdown(kind: PrRoleKind, q?: string): Promise<EmployeeOption[]> {
    const search = q?.trim().slice(0, 100);
    const rows: EmployeeRow[] = await this.dataSource.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees e
       WHERE ${ACTIVE_EMPLOYEE} AND ${PR_ROLE_SQL[kind]} AND ${EMPLOYEE_MATCH('$1')}
       ORDER BY e.initial NULLS LAST, e.firstname`,
      [search ? `%${search}%` : null],
    );
    return rows.map(employeeOption);
  }

  /** Employee search used to pick committee members. */
  async searchEmployees(q?: string): Promise<EmployeeOption[]> {
    const search = q?.trim().slice(0, 100);
    const rows: EmployeeRow[] = await this.dataSource.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees e
       WHERE ${ACTIVE_EMPLOYEE} AND ${EMPLOYEE_MATCH('$1')}
       ORDER BY e.initial NULLS LAST, e.firstname LIMIT 50`,
      [search ? `%${search}%` : null],
    );
    return rows.map(employeeOption);
  }

  private async queryMembers(committeeId: number, q?: string): Promise<EmployeeOption[]> {
    const search = q?.trim().slice(0, 100);
    const rows: EmployeeRow[] = await this.dataSource.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM committee_members m JOIN employees e ON e.id = m.employee_id
       WHERE m.committee_id = $1 AND ${ACTIVE_EMPLOYEE} AND ${EMPLOYEE_MATCH('$2')}
       ORDER BY e.initial NULLS LAST, e.firstname`,
      [committeeId, search ? `%${search}%` : null],
    );
    return rows.map(employeeOption);
  }

  private async findOne(id: number) {
    const rows = await this.dataSource.query(
      `SELECT id, name, description FROM committees WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (!rows.length) throw new NotFoundException('Committee not found');
    return rows[0];
  }

  private async assertNameFree(name: string, exceptId?: number) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM committees WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND ($2::int IS NULL OR id <> $2)`,
      [name.trim(), exceptId ?? null],
    );
    if (rows.length) throw new ConflictException('A committee with this name already exists');
  }
}
