import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Project {
  id: number;
  projectNo: string;
  name: string;
  status: 'active' | 'inactive';
  source: string;
  externalId: string | null;
  /** The project's status in PMTS (information only). */
  externalStatus: string | null;
  /** "project no - name", as shown in dropdowns. */
  label: string;
}

export type SyncMode = 'incremental' | 'full';

export interface ProjectSyncState {
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
  watermark: string | null;
  configured: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/projects`;

  /** Active projects for a form dropdown. */
  dropdown(q = ''): Observable<Project[]> {
    return this.http.get<{ data: Project[] }>(`${this.base}/dropdown`, { params: this.params(q) }).pipe(map((res) => res.data));
  }

  /** All projects, for the Master Data page. */
  list(q = ''): Observable<Project[]> {
    return this.http.get<{ data: Project[] }>(this.base, { params: this.params(q) }).pipe(map((res) => res.data));
  }

  create(projectNo: string, name: string): Observable<Project> {
    return this.http.post<Project>(this.base, { projectNo, name });
  }

  update(id: number, projectNo: string, name: string, status: 'active' | 'inactive'): Observable<Project> {
    return this.http.put<Project>(`${this.base}/${id}`, { projectNo, name, status });
  }

  syncState(): Observable<ProjectSyncState> {
    return this.http.get<ProjectSyncState>(`${this.base}/sync`);
  }

  /** Starts the copy from PMTS; it runs on the server in the background. */
  startSync(mode: SyncMode): Observable<ProjectSyncState> {
    return this.http.post<ProjectSyncState>(`${this.base}/sync`, { mode });
  }

  private params(q: string): HttpParams {
    return q.trim() ? new HttpParams().set('q', q.trim()) : new HttpParams();
  }
}
