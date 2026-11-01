import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from '../config/api.config';
import { map, Observable } from 'rxjs';

export interface SubConsultantItem {
  id: number;
  type: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
  status?: string;
  create_by?: string | null;
  update_by?: string | null;
  created_at?: string;
  updated_at?: string;
  No?: number;
}

export interface SubConsultantCreatePayload {
  type: string;
  name: string;
  status?: 'Active' | 'Inactive';
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

export type SubConsultantUpdatePayload = SubConsultantCreatePayload;

interface LaravelPaginator<T> {
  current_page: number;
  data: T[];
  last_page: number;
  per_page: number;
  total: number;
}

interface ApiResponse<T> {
  code: string;
  status: boolean;
  message: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class SubConsultantService {
  private columns = [
    { data: 'No' },
    { data: 'name' },
    { data: 'type' },
    { data: 'status' },
    { data: 'create_by' },
    { data: 'update_by' },
    { data: 'created_at' },
    { data: 'updated_at' },
    { data: 'action' },
  ];

  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  list(opts: {
    page: number;
    perPage: number;
    search?: string;
    status?: string;
    type?: string;
    draw?: number;
    order?: Array<{ column: number; dir: 'asc' | 'desc' }>;
  }): Observable<{
    items: SubConsultantItem[];
    total: number;
    page: number;
    perPage: number;
    lastPage: number;
  }> {
    const page = opts.page ?? 1;
    const perPage = opts.perPage ?? 10;

    const keyword = (opts.search ?? '').trim();
    const status = (opts.status ?? '').trim();

    const columns = this.columns.map((c) => ({
      ...c,
      searchable: true,
      orderable: true,
      search: { value: '', regex: false },
    }));

    if (status) {
      const statusIndex = columns.findIndex((c) => c.data === 'status');
      if (statusIndex >= 0) columns[statusIndex].search.value = status;
    }

    const body: any = {
      draw: opts.draw ?? 1,
      type: opts.type ?? 'deposit',
      columns,
      order: opts.order ?? [{ column: 0, dir: 'asc' as const }],
      start: (page - 1) * perPage,
      length: perPage,

      search: { value: keyword, regex: false },

      // ✅ ให้เห็นใน Network ชัด ๆ + เผื่อ backend ใช้
      status,
      status_filter: status,
    };

    const params = new HttpParams().set('page', String(page));

    return this.http
      .post<ApiResponse<LaravelPaginator<SubConsultantItem>>>(
        this.apiConfig.buildUrl('api/sub_consultants_page'),
        body,
        { params }
      )
      .pipe(
        map((res) => {
          const p = res.data;
          return {
            items: p?.data ?? [],
            total: p?.total ?? 0,
            page: p?.current_page ?? page,
            perPage: p?.per_page ?? perPage,
            lastPage: p?.last_page ?? 1,
          };
        })
      );
  }

  create(payload: SubConsultantCreatePayload): Observable<ApiResponse<any>> {
    if (!payload?.type) throw new Error('SubConsultantService.create: "type" is required');
    return this.http.post<ApiResponse<any>>(this.apiConfig.buildUrl('api/sub_consultants'), payload);
  }

  getById(id: number | string): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(this.apiConfig.buildUrl(`api/sub_consultants/${id}`));
  }

  update(id: number | string, payload: SubConsultantUpdatePayload): Observable<ApiResponse<any>> {
    if (!payload?.type) throw new Error('SubConsultantService.update: "type" is required');
    return this.http.put<ApiResponse<any>>(this.apiConfig.buildUrl(`api/sub_consultants/${id}`), payload);
  }

  delete(id: number | string): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(this.apiConfig.buildUrl(`api/sub_consultants/${id}`));
  }
}
