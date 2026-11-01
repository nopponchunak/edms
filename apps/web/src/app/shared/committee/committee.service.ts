import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmployeeOption {
  id: number;
  code: string | null;
  username: string | null;
  initial: string | null;
  title: string | null;
  level: string | null;
  name: string;
  /** "initial, First Last" — rendered as is by every employee dropdown. */
  label: string;
}

export interface Committee {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
}

@Injectable({ providedIn: 'root' })
export class CommitteeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/committees`;

  list(): Observable<Committee[]> {
    return this.http.get<{ data: Committee[] }>(this.base).pipe(map((res) => res.data));
  }

  create(name: string, description: string): Observable<Committee> {
    return this.http.post<Committee>(this.base, { name, description });
  }

  update(id: number, name: string, description: string): Observable<unknown> {
    return this.http.put(`${this.base}/${id}`, { name, description });
  }

  remove(id: number): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  members(id: number): Observable<EmployeeOption[]> {
    return this.http.get<{ data: EmployeeOption[] }>(`${this.base}/${id}/members`).pipe(map((res) => res.data));
  }

  setMembers(id: number, employeeIds: number[]): Observable<EmployeeOption[]> {
    return this.http.put<{ data: EmployeeOption[] }>(`${this.base}/${id}/members`, { employeeIds }).pipe(map((res) => res.data));
  }

  searchEmployees(q: string): Observable<EmployeeOption[]> {
    const params = new HttpParams().set('q', q);
    return this.http.get<{ data: EmployeeOption[] }>(`${this.base}/employees/search`, { params }).pipe(map((res) => res.data));
  }

  /** Members of a committee (id or exact name) for a form dropdown. */
  dropdown(ref: string | number, q = ''): Observable<EmployeeOption[]> {
    let params = new HttpParams();
    if (q.trim()) params = params.set('q', q.trim());
    return this.http.get<{ data: EmployeeOption[] }>(`${this.base}/dropdown/${encodeURIComponent(String(ref))}`, { params }).pipe(map((res) => res.data));
  }
}
