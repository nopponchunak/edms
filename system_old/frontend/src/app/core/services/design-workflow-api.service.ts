import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { Observable, forkJoin, map, of } from 'rxjs';

export type DesignWorkflowStepStatus =
  | 'complete'
  | 'in_process'
  | 'overdue'
  | 'pending'
  | 'rejected';

export interface DesignWorkflowDocumentType {
  type: string;
  label: string;
}

export interface DesignWorkflowDocument {
  id: number | string;
  label: string;
  projectNumber: string;
  projectName: string;
  discipline: string;
  documentLocation: string;
  documentTypes: string[];
  createdAt: string;
  updatedAt: string;
  viewRoute: string;
}

export interface DesignWorkflowStep {
  key: string;
  role: string;
  action: string;
  assignee: string;
  assigneeCode?: string | null;
  assigneeInitial?: string | null;
  assigneeName?: string | null;
  assigneeRaw?: unknown;
  date: string | null;
  receivedAt?: string | null;
  waitingDays?: number;
  overdueDays?: number;
  isOverdue?: boolean;
  status: DesignWorkflowStepStatus;
  statusText: string;
  order: number;
}

export interface DesignWorkflowSummary {
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
  currentStep: DesignWorkflowStep | null;
  isComplete: boolean;
}

export interface DesignWorkflowDetail {
  type: string;
  typeLabel: string;
  document: DesignWorkflowDocument;
  summary: DesignWorkflowSummary;
  steps: DesignWorkflowStep[];
}

export interface DesignWorkflowReportRow {
  type: string;
  typeLabel: string;
  document: DesignWorkflowDocument;
  currentStep: DesignWorkflowStep;
  responsiblePerson: string;
  responsiblePersonCode?: string | null;
  responsiblePersonInitial?: string | null;
  responsiblePersonName?: string | null;
  projectNumber: string;
  projectName: string;
  discipline: string;
  stage: string;
  statusLabel: string;
  days: number;
  totalWaitingDays: number;
  lastStatus: string;
}

export interface DesignWorkflowReportFilterOptions {
  responsiblePersons: string[];
  disciplines?: string[];
  stages: string[];
  statuses: string[];
}

export interface DesignWorkflowReportAppliedFilters {
  responsiblePerson?: string;
  responsiblePersons?: string[];
  discipline?: string;
  disciplines?: string[];
  stage?: string;
  status?: string;
  dateStart?: string;
  dateEnd?: string;
}

export interface DesignWorkflowReportRequestFilters {
  responsiblePerson?: string | string[];
  responsiblePersons?: string[];
  discipline?: string | string[];
  disciplines?: string[];
  stage?: string;
  status?: string;
  dateStart?: Date | string | null;
  dateEnd?: Date | string | null;
  excludeTypes?: string[];
}

export interface DesignWorkflowReport {
  generatedAt: string;
  totalRows?: number;
  filteredRows?: number;
  filters?: DesignWorkflowReportFilterOptions;
  appliedFilters?: DesignWorkflowReportAppliedFilters;
  rows: DesignWorkflowReportRow[];
}

@Injectable({ providedIn: 'root' })
export class DesignWorkflowApiService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  getDocumentTypes(): Observable<DesignWorkflowDocumentType[]> {
    return this.http
      .get<any>(this.apiConfig.buildUrl('api/design_workflow/document_types'))
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getDocuments(type: string, search: string = ''): Observable<DesignWorkflowDocument[]> {
    let params = new HttpParams().set('type', type).set('limit', '300');

    if (search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http
      .get<any>(this.apiConfig.buildUrl('api/design_workflow/documents'), { params })
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getWorkflow(type: string, id: string | number): Observable<DesignWorkflowDetail> {
    return this.http
      .get<any>(this.apiConfig.buildUrl(`api/design_workflow/${type}/${id}`))
      .pipe(map((response) => response?.data ?? response));
  }

  getReport(filters: DesignWorkflowReportRequestFilters = {}): Observable<DesignWorkflowReport> {
    const responsiblePersons = this.normalizeFilterValues(filters.responsiblePersons ?? filters.responsiblePerson);
    const disciplines = this.normalizeFilterValues(filters.disciplines ?? filters.discipline);

    if (responsiblePersons.length <= 1 && disciplines.length <= 1) {
      return this.getReportRequest(filters, responsiblePersons[0], disciplines[0]);
    }

    const reportRequests = this.buildReportRequests(filters, responsiblePersons, disciplines);

    if (!reportRequests.length) {
      return of(this.emptyReport());
    }

    return forkJoin(reportRequests).pipe(
      map((reports) => this.mergeReportResponses(reports, responsiblePersons, disciplines))
    );
  }

  private getReportRequest(
    filters: DesignWorkflowReportRequestFilters,
    responsiblePerson?: string,
    discipline?: string
  ): Observable<DesignWorkflowReport> {
    let params = new HttpParams();

    if (responsiblePerson) {
      params = params.set('responsible_person', responsiblePerson);
    }

    if (discipline) {
      params = params.set('discipline', discipline);
    }

    if (filters.stage && filters.stage !== 'all') {
      params = params.set('stage', filters.stage);
    }

    if (filters.status && filters.status !== 'all') {
      params = params.set('status', filters.status);
    }

    const dateStart = this.formatDateParam(filters.dateStart);
    const dateEnd = this.formatDateParam(filters.dateEnd);

    if (dateStart) {
      params = params.set('date_start', dateStart);
    }

    if (dateEnd) {
      params = params.set('date_end', dateEnd);
    }

    if (filters.excludeTypes?.length) {
      params = params.set('exclude_type', filters.excludeTypes.join(','));
    }

    return this.http
      .get<any>(this.apiConfig.buildUrl('api/design_workflow/report'), { params })
      .pipe(map((response) => response?.data ?? response));
  }

  private buildReportRequests(
    filters: DesignWorkflowReportRequestFilters,
    responsiblePersons: string[],
    disciplines: string[]
  ): Observable<DesignWorkflowReport>[] {
    const responsibleValues = responsiblePersons.length ? responsiblePersons : [undefined];
    const disciplineValues = disciplines.length ? disciplines : [undefined];

    return responsibleValues.flatMap((responsiblePerson) =>
      disciplineValues.map((discipline) => this.getReportRequest(filters, responsiblePerson, discipline))
    );
  }

  private mergeReportResponses(
    reports: DesignWorkflowReport[],
    responsiblePersons: string[],
    disciplines: string[]
  ): DesignWorkflowReport {
    const rowsByKey = new Map<string, DesignWorkflowReportRow>();
    const responsibleOptions: string[] = [];
    const disciplineOptions: string[] = [];
    const stageOptions: string[] = [];
    const statusOptions: string[] = [];

    reports.forEach((report) => {
      (report?.rows ?? []).forEach((row) => {
        rowsByKey.set(this.reportRowKey(row), row);
      });

      responsibleOptions.push(...(report?.filters?.responsiblePersons ?? []));
      disciplineOptions.push(...(report?.filters?.disciplines ?? []));
      stageOptions.push(...(report?.filters?.stages ?? []));
      statusOptions.push(...(report?.filters?.statuses ?? []));
    });

    const rows = Array.from(rowsByKey.values());
    const firstReport = reports[0] ?? this.emptyReport();
    const totalRows = reports
      .map((report) => Number(report?.totalRows ?? 0))
      .reduce((max, value) => Math.max(max, value), rows.length);

    return {
      ...firstReport,
      totalRows,
      filteredRows: rows.length,
      filters: {
        responsiblePersons: this.uniqueValues(responsibleOptions),
        disciplines: this.uniqueValues(disciplineOptions),
        stages: this.uniqueValues(stageOptions),
        statuses: this.uniqueValues(statusOptions),
      },
      appliedFilters: {
        ...(firstReport.appliedFilters ?? {}),
        responsiblePersons,
        disciplines,
      },
      rows,
    };
  }

  private emptyReport(): DesignWorkflowReport {
    return {
      generatedAt: new Date().toISOString(),
      totalRows: 0,
      filteredRows: 0,
      filters: {
        responsiblePersons: [],
        disciplines: [],
        stages: [],
        statuses: [],
      },
      rows: [],
    };
  }

  private reportRowKey(row: DesignWorkflowReportRow): string {
    return [
      row.type,
      row.document?.id,
      row.currentStep?.key,
      row.currentStep?.order,
      row.responsiblePerson,
      row.projectNumber,
      row.projectName,
      row.discipline,
      row.stage,
      row.statusLabel,
      row.days,
      row.lastStatus,
    ].join('|');
  }

  private uniqueValues(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private normalizeFilterValues(value: string | string[] | null | undefined): string[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];

    return values
      .map((item) => String(item).trim())
      .filter((item) => item && item !== 'all');
  }

  private formatDateParam(value: Date | string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    }

    const trimmed = String(value).trim();

    return trimmed || null;
  }
}
