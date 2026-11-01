import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, of, switchMap } from 'rxjs';
import { environment } from 'environments/environment';

export type DtOrderDir = 'asc' | 'desc';

export interface DtColumn { data: string; }
export interface DtOrder { column: number; dir: DtOrderDir; }
export interface DtSearch { value: string; regex: boolean; }

export interface SuppliersPageRequest {
  draw: number;
  type: string;
  columns: DtColumn[];
  order: DtOrder[];
  start: number;
  length: number;
  search: DtSearch;
}

export interface SupplierApiRow {
  id: number;
  type: string;
  name: string;
  status: string;
  address?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
  create_by?: string | null;
  update_by?: string | null;
  created_at?: string;
  updated_at?: string;
  No?: number;
}

export interface SupplierOption {
  id: number;
  type: string;
  name: string;
  status: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

export interface SupplierStatusUpdateResult {
  updated: boolean;
  supplier?: SupplierOption;
  reason?: 'missing_supplier_name' | 'not_found' | 'already_inactive';
}

export interface CreateSupplierRequest {
  type: string;
  name: string;
  status: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
}

interface GetSuppliersApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: SupplierOption[];
}

interface SuppliersPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page: number;
    data: SupplierApiRow[];
    per_page: number;
    total: number;
  };
}

export interface SuppliersPageResult {
  items: SupplierApiRow[];
  total: number;
  page: number;
  perPage: number;
}

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  // ใช้ให้ตรงกับโปรเจกต์คุณ: apiUrl หรือ apiBase
  private readonly base = (environment as any).apiUrl ?? (environment as any).apiBase;
  private readonly url = `${this.base}/api/suppliers_page`;

  constructor(private http: HttpClient) {}

  suppliersPage(req: SuppliersPageRequest, opts?: { token?: string }): Observable<SuppliersPageResult> {
    return this.http.post<SuppliersPageApiResponse>(this.url, req, {
      headers: this.makeAuthHeaders(opts?.token),
    }).pipe(
      map((res) => {
        const items = res?.data?.data ?? [];
        const total = res?.data?.total ?? items.length;
        const page = res?.data?.current_page ?? 1;
        const perPage = res?.data?.per_page ?? req.length;

        return { items, total, page, perPage };
      })
    );
  }

  buildSuppliersPageRequest(params: {
    draw: number;
    type?: string;
    pageIndex: number; // 0-based
    pageSize: number;
    searchText?: string;
    orderColumnIndex?: number;
    orderDir?: DtOrderDir;
  }): SuppliersPageRequest {
    const {
      draw,
      type = 'deposit',
      pageIndex,
      pageSize,
      searchText = '',
      orderColumnIndex = 0,
      orderDir = 'asc',
    } = params;

    return {
      draw,
      type,
      columns: [
        { data: 'No' },
        { data: 'name' },
        { data: 'create_by' },
        { data: 'update_by' },
        { data: 'created_at' },
        { data: 'updated_at' },
        { data: 'action' },
      ],
      order: [{ column: orderColumnIndex, dir: orderDir }],
      start: pageIndex * pageSize,
      length: pageSize,
      search: { value: searchText, regex: false },
    };
  }

  delete(id: number): Observable<any> {
    const url = `${this.base}/api/suppliers/${id}`;
    return this.http.delete(url);
  }

  create(payload: CreateSupplierRequest): Observable<any> {
    const url = `${this.base}/api/suppliers`;
    return this.http.post(url, payload);
  }

  update(id: number, payload: CreateSupplierRequest): Observable<any> {
    const url = `${this.base}/api/suppliers/${id}`;
    return this.http.patch(url, payload);
  }

  deactivateByName(name: string): Observable<SupplierStatusUpdateResult> {
    const supplierName = String(name || '').trim().toLowerCase();

    if (!supplierName) {
      return of<SupplierStatusUpdateResult>({ updated: false, reason: 'missing_supplier_name' });
    }

    return this.getAllSuppliers().pipe(
      switchMap((suppliers) => {
        const supplier = suppliers.find(
          (item) => String(item.name || '').trim().toLowerCase() === supplierName
        );

        if (!supplier) {
          return of<SupplierStatusUpdateResult>({ updated: false, reason: 'not_found' });
        }

        if (String(supplier.status || '').trim().toLowerCase() === 'inactive') {
          return of<SupplierStatusUpdateResult>({
            updated: false,
            supplier,
            reason: 'already_inactive',
          });
        }

        return this.update(supplier.id, {
          type: supplier.type,
          name: supplier.name,
          status: 'Inactive',
          address: supplier.address ?? null,
          phone: supplier.phone ?? null,
          email: supplier.email ?? null,
          contact_person: supplier.contact_person ?? null,
        }).pipe(
          map((): SupplierStatusUpdateResult => ({ updated: true, supplier }))
        );
      })
    );
  }

  /**
   * Get all suppliers from GET /api/get_suppliers
   * Returns only Active suppliers
   */
  getSuppliers(): Observable<SupplierOption[]> {
    return this.getAllSuppliers().pipe(
      map((suppliers) =>
        suppliers.filter((supplier) => supplier.status?.toLowerCase() === 'active')
      )
    );
  }

  getAllSuppliers(): Observable<SupplierOption[]> {
    const url = `${this.base}/api/get_suppliers`;
    return this.http.get<GetSuppliersApiResponse>(url).pipe(
      map((res) => {
        if (!res?.status || !Array.isArray(res?.data)) {
          return [];
        }
        return res.data;
      })
    );
  }

  private makeAuthHeaders(token?: string): HttpHeaders | undefined {
    if (!token) return undefined; // ถ้ามี Interceptor ก็ไม่ต้องส่ง token
    const v = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    return new HttpHeaders({ Authorization: v });
  }
}
