import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { environment } from 'environments/environment';
import { Observable, map } from 'rxjs';

export interface LegacyDesignReviewStage {
  key: string;
  label: string;
  legacyStageLabel: string;
  table: string;
  idColumn: string;
  webboardTable: string;
}

export interface LegacyDesignReviewStageCount {
  key: string;
  label: string;
  table: string;
  total: number;
  active: number;
}

export interface LegacyDesignReviewStatus {
  code: number | null;
  label: string;
}

export interface LegacyDesignReviewSummaryItem {
  id: number;
  stage: {
    key: string;
    label: string;
    legacyLabel: string;
  };
  projectId: string;
  projectName: string;
  discipline: string;
  createdDate: string | null;
  teamEngineer: string | null;
  reviewer: string | null;
  teamlead: string | null;
  director: string | null;
  status: LegacyDesignReviewStatus;
}

export interface LegacyDesignReviewPerson {
  id: number | null;
  name: string | null;
  date: string | null;
}

export interface LegacyDesignReviewAction {
  topicId: number;
  questionId: number;
  question: string;
  answer: string;
  status: LegacyDesignReviewStatus;
}

export interface LegacyPeerReviewDetail {
  id: number;
  stageKey: string;
  stage: string;
  legacyStage: string;
  source: {
    table: string;
    idColumn: string;
    webboardTable: string;
  };
  project: {
    id: string;
    name: string;
  };
  preparedBy: string | null;
  fileLocation: string | null;
  involved: {
    names: string | null;
    emails: string | null;
  };
  discipline: {
    id: number | null;
    name: string | null;
    other: string | null;
  };
  documents: string[];
  documentOther: string | null;
  scores: Record<string, boolean | null>;
  comment: string | null;
  recommend: string | null;
  qualityProcedure: string | null;
  note: string | null;
  satisfactorily: string | null;
  people: {
    reviewer: LegacyDesignReviewPerson;
    respondedBy: LegacyDesignReviewPerson;
    teamlead: LegacyDesignReviewPerson;
    director: LegacyDesignReviewPerson;
  };
  dates: Record<string, string | null>;
  status: LegacyDesignReviewStatus;
  actions: LegacyDesignReviewAction[];
}

export interface LegacyDesignReviewMigrationSummary {
  ready?: boolean;
  sync: {
    total: number;
    userMatched: number;
    generated: number;
  };
  users: {
    total: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
  };
  created?: number;
  updated?: number;
  matched?: number;
  unmatched?: number;
  ambiguous?: number;
  generated?: number;
  skipped?: number;
  errors?: string[];
}

export interface LegacyDesignReviewCompletedRecordType {
  value: string;
  label: string;
  sourceStage: string;
  sourceStageLabel: string;
  total: number;
}

export interface LegacyDesignReviewCompletedRecord {
  No: number;
  id: number;
  sourceSystem: string;
  sourceDatabase: string;
  sourceStage: string;
  sourceStageLabel: string;
  sourceTable: string;
  sourceId: string;
  projectNo: string | null;
  projectName: string | null;
  discipline: string | null;
  legacyStatusCode: number | null;
  legacyStatusLabel: string | null;
  targetModule: string | null;
  targetModuleLabel: string;
  targetTable: string | null;
  targetRoute: string | null;
  syncStatus: string;
  userMappingStatus: string;
  generateStatus: string;
  generatedId: number | null;
  generatedTable: string | null;
  createdDate: string | null;
  reviewedDate: string | null;
  respondedDate: string | null;
  approvedDate: string | null;
  teamleadReviewedDate: string | null;
  acknowledgedDate: string | null;
  preparedBy: string | null;
  reviewer: string | null;
  teamlead: string | null;
  director: string | null;
  syncedAt: string | null;
  generatedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LegacyDesignReviewCompletedRecordsPage {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: LegacyDesignReviewCompletedRecord[];
}

@Injectable({ providedIn: 'root' })
export class LegacyDesignReviewApiService {
  private readonly legacyApiUrl = environment.legacyDesignReviewApiUrl;

  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  getStages(): Observable<{
    stages: LegacyDesignReviewStage[];
    counts: LegacyDesignReviewStageCount[];
  }> {
    return this.http
      .get<any>(this.buildLegacyUrl('api/legacy-design-review/stages'))
      .pipe(map((response) => response?.data ?? response));
  }

  getStageSummary(
    stage: string,
    options: { limit?: number; search?: string; status?: 'active' | 'all' | 'completed' } = {}
  ): Observable<LegacyDesignReviewSummaryItem[]> {
    let params = new HttpParams().set('limit', String(options.limit ?? 300));

    if (options.search?.trim()) {
      params = params.set('search', options.search.trim());
    }

    if (options.status) {
      params = params.set('status', options.status);
    }

    return this.http
      .get<any>(this.buildLegacyUrl(`api/legacy-design-review/stages/${stage}/summary`), { params })
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getPeerReview(id: number | string): Observable<LegacyPeerReviewDetail> {
    return this.http
      .get<any>(this.buildLegacyUrl(`api/legacy-design-review/peer-reviews/${id}`))
      .pipe(map((response) => response?.data ?? response));
  }

  getItem(stage: string, id: number | string): Observable<LegacyPeerReviewDetail> {
    return this.http
      .get<any>(this.buildLegacyUrl(`api/legacy-design-review/stages/${stage}/items/${id}`))
      .pipe(map((response) => response?.data ?? response));
  }

  getPeerReviewActions(id: number | string): Observable<LegacyDesignReviewAction[]> {
    return this.http
      .get<any>(this.buildLegacyUrl(`api/legacy-design-review/peer-reviews/${id}/actions`))
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getItemActions(stage: string, id: number | string): Observable<LegacyDesignReviewAction[]> {
    return this.http
      .get<any>(this.buildLegacyUrl(`api/legacy-design-review/stages/${stage}/items/${id}/actions`))
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getMigrationSummary(): Observable<LegacyDesignReviewMigrationSummary> {
    return this.http
      .get<any>(this.buildLegacyUrl('api/legacy-design-review/migration-summary'))
      .pipe(map((response) => response?.data ?? response));
  }

  getCompletedRecordTypes(): Observable<LegacyDesignReviewCompletedRecordType[]> {
    return this.http
      .get<any>(this.buildLegacyUrl('api/legacy-design-review/completed-record-types'))
      .pipe(map((response) => response?.data ?? response ?? []));
  }

  getCompletedRecordsPage(params: {
    draw: number;
    columns: Array<{ data: string }>;
    order: Array<{ column: number; dir: 'asc' | 'desc' | string }>;
    start: number;
    length: number;
    search: { value: string; regex: boolean };
    type?: string;
  }): Observable<LegacyDesignReviewCompletedRecordsPage> {
    return this.http
      .post<any>(this.buildLegacyUrl('api/legacy-design-review/completed-records/page'), params)
      .pipe(map((response) => response?.data ?? response));
  }

  syncLegacyData(options: { limit?: number; stage?: string; source_database?: string; status?: 'active' | 'all' } = {}): Observable<LegacyDesignReviewMigrationSummary> {
    return this.http
      .post<any>(this.buildLegacyUrl('api/legacy-design-review/sync'), options)
      .pipe(map((response) => response?.data ?? response));
  }

  mapLegacyUsers(options: { source_database?: string } = {}): Observable<LegacyDesignReviewMigrationSummary> {
    return this.http
      .post<any>(this.buildLegacyUrl('api/legacy-design-review/users/map'), options)
      .pipe(map((response) => response?.data ?? response));
  }

  generateLegacyRecords(options: { limit?: number; stage?: string; source_database?: string } = {}): Observable<LegacyDesignReviewMigrationSummary> {
    return this.http
      .post<any>(this.buildLegacyUrl('api/legacy-design-review/generate'), options)
      .pipe(map((response) => response?.data ?? response));
  }

  private buildLegacyUrl(endpoint: string): string {
    if (!this.legacyApiUrl) {
      return this.apiConfig.buildUrl(endpoint);
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const cleanApiUrl = this.legacyApiUrl.endsWith('/') ? this.legacyApiUrl.slice(0, -1) : this.legacyApiUrl;
    return `${cleanApiUrl}/${cleanEndpoint}`;
  }
}
