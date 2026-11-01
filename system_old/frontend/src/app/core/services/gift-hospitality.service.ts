import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';
import {
  GiftHospitality,
  CreateGiftHospitalityDto,
  UpdateGiftHospitalityDto,
  VerifyRequestDto,
  AcknowledgeRequestDto,
  ApproveRequestDto,
  UpdateStatusDto,
} from '../models/gift-hospitality.model';

@Injectable({
  providedIn: 'root'
})
export class GiftHospitalityService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  create(createGiftHospitalityDto: CreateGiftHospitalityDto): Observable<GiftHospitality> {
    return this.http.post<GiftHospitality>(this.apiConfig.buildUrl('api/gift_hospitalities'), createGiftHospitalityDto);
  }

  findAll(): Observable<GiftHospitality[]> {
    return this.http.get<GiftHospitality[]>(this.apiConfig.buildUrl('api/gift-hospitality'));
  }

  /**
   * Get paginated gift hospitality list using POST /api/gift_hospitalities_page
   */
  findAllPaginated(request: GiftHospitalitiesPageRequest): Observable<GiftHospitalitiesPageResponse> {
    return this.http.post<GiftHospitalitiesPageApiResponse>(this.apiConfig.buildUrl('api/gift_hospitalities_page'), request).pipe(
      map(response => this.transformGiftHospitalitiesPageResponse(response))
    );
  }

  findOne(id: string): Observable<GiftHospitality> {
    return this.http.get<GiftHospitalityApiResponse>(this.apiConfig.buildUrl(`api/gift_hospitalities/${id}`)).pipe(
      map(response => this.transformGiftHospitalityApiResponse(response))
    );
  }

  update(id: string, updateGiftHospitalityDto: UpdateGiftHospitalityDto): Observable<GiftHospitality> {
    return this.http.put<GiftHospitalityApiResponse>(this.apiConfig.buildUrl(`api/gift_hospitalities/${id}`), updateGiftHospitalityDto).pipe(
      map(response => this.transformGiftHospitalityApiResponse(response))
    );
  }

  action(id: string, type: string, decision: string, comments?: string): Observable<GiftHospitality> {
    return this.http.patch<GiftHospitalityApiResponse>(
      this.apiConfig.buildUrl(`api/gift_hospitalities/${id}/actions/${type}`),
      { decision, comments }
    ).pipe(map(response => this.transformGiftHospitalityApiResponse(response)));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(
      this.apiConfig.buildUrl(`api/gift_hospitalities/${id}`));
  }

  getMyRequests(): Observable<GiftHospitality[]> {
    return this.http.get<GiftHospitality[]>(this.apiConfig.buildUrl('api/gift-hospitality/my-requests'));
  }

  getPendingForMe(): Observable<GiftHospitality[]> {
    return this.http.get<GiftHospitality[]>(this.apiConfig.buildUrl('api/gift-hospitality/pending-for-me'));
  }

  verify(id: string, verifyRequestDto: VerifyRequestDto): Observable<GiftHospitality> {
    return this.action(id, 'verified_by_status', 'approved', verifyRequestDto.comments);
  }

  acknowledge(id: string, acknowledgeRequestDto: AcknowledgeRequestDto): Observable<GiftHospitality> {
    return this.action(id, 'acknowledged_by_status', 'approved', acknowledgeRequestDto.comments);
  }

  approve(id: string, approveRequestDto: ApproveRequestDto): Observable<GiftHospitality> {
    return this.action(
      id,
      'approved_by_status',
      approveRequestDto.approvedDecision ? 'approved' : 'rejected',
      approveRequestDto.comments
    );
  }

  /**
   * Update status using PUT /api/update_status/{id}
   */
  updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
    return this.http.put<any>(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
  }

  /**
   * Transform API response to match GiftHospitality model structure
   */
  private transformGiftHospitalitiesPageResponse(response: GiftHospitalitiesPageApiResponse): GiftHospitalitiesPageResponse {
    return {
      currentPage: response.data.current_page,
      data: response.data.data.map(item => this.transformGiftHospitalityItem(item)),
      firstPageUrl: response.data.first_page_url,
      from: response.data.from,
      lastPage: response.data.last_page,
      lastPageUrl: response.data.last_page_url,
      links: response.data.links,
      nextPageUrl: response.data.next_page_url,
      path: response.data.path,
      perPage: response.data.per_page,
      prevPageUrl: response.data.prev_page_url,
      to: response.data.to,
      total: response.data.total
    };
  }

  /**
   * Transform single gift hospitality API response to GiftHospitality model
   */
  private transformGiftHospitalityApiResponse(response: GiftHospitalityApiResponse): GiftHospitality {
    const item = response.data;
    return this.transformGiftHospitalityItem(item);
  }

  /**
   * Transform gift hospitality item from snake_case to camelCase
   */
  private transformGiftHospitalityItem(item: any): GiftHospitality {
    return {
      id: String(item.id),
      requestType: item.request_type as 'gift' | 'hospitality',
      description: item.description,
      purpose: item.purpose,
      value: typeof item.value === 'string' ? parseFloat(item.value) : item.value,
      companyOfGiver: item.company_of_giver,
      proposedDate: item.proposed_date,
      mtlReceivingStaff: item.mtl_receiving_staff || '',
      status: item.status || 'pending' as any,
      
      // MTL Receiving Staff fields
      // Handle null, undefined, and empty string - treat as null (pending)
      mtlReceivingStaffBy: item.mtl_receiving_staff_by != null ? item.mtl_receiving_staff_by : null,
      mtlReceivingStaffByDate: item.mtl_receiving_staff_by_date != null ? item.mtl_receiving_staff_by_date : null,
      mtlReceivingStaffByStatus: item.mtl_receiving_staff_by_status != null ? item.mtl_receiving_staff_by_status : null,
      
      // Verified By fields (using code)
      verifiedBy: item.verified_by != null ? item.verified_by : null,
      verifiedByDate: item.verified_by_date != null ? item.verified_by_date : null,
      verifiedByStatus: item.verified_by_status != null ? item.verified_by_status : null,
      
      // Acknowledged By fields (using code)
      acknowledgedBy: item.acknowledged_by != null ? item.acknowledged_by : null,
      acknowledgedByDate: item.acknowledged_by_date != null ? item.acknowledged_by_date : null,
      acknowledgedByStatus: item.acknowledged_by_status != null ? item.acknowledged_by_status : null,
      imsAcknowledgedBy: item.ims_acknowledged_by ?? null,
      imsAcknowledgedByDate: item.ims_acknowledged_by_date ?? null,
      imsAcknowledgedByStatus: item.ims_acknowledged_by_status ?? null,
      
      // Approved By fields (using code)
      approvedBy: item.approved_by != null ? item.approved_by : null,
      approvedByDate: item.approved_by_date != null ? item.approved_by_date : null,
      approvedByStatus: item.approved_by_status != null ? item.approved_by_status : null,
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
      
      // Legacy fields for backward compatibility
      verifiedById: item.verified_by_id ? String(item.verified_by_id) : undefined,
      acknowledgedById: item.acknowledged_by_id ? String(item.acknowledged_by_id) : undefined,
      approvedById: item.approved_by_id ? String(item.approved_by_id) : undefined,
      requestedBy: item.requested_by || { id: '', firstName: '', lastName: '', email: '' },
      requestedDate: item.requested_date || item.created_at,
      
      // Audit fields
      createBy: item.create_by,
      updateBy: item.update_by || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      deletedAt: item.deleted_at || null,
      version: item.version || 1
    };
  }
}

// Interfaces for gift hospitalities page API
export interface GiftHospitalitiesPageRequest {
  draw: number;
  type?: string;
  columns: Array<{ data: string }>;
  order: Array<{ column: number; dir: 'asc' | 'desc' }>;
  start: number;
  length: number;
  search: {
    value: string;
    regex: boolean;
  };
}

export interface GiftHospitalitiesPageResponse {
  currentPage: number;
  data: GiftHospitality[];
  firstPageUrl: string;
  from: number;
  lastPage: number;
  lastPageUrl: string;
  links: Array<{ url: string | null; label: string; active: boolean }>;
  nextPageUrl: string | null;
  path: string;
  perPage: number;
  prevPageUrl: string | null;
  to: number;
  total: number;
}

interface GiftHospitalitiesPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page: number;
    data: any[];
    first_page_url: string;
    from: number;
    last_page: number;
    last_page_url: string;
    links: Array<{ url: string | null; label: string; active: boolean }>;
    next_page_url: string | null;
    path: string;
    per_page: number;
    prev_page_url: string | null;
    to: number;
    total: number;
  };
}

interface GiftHospitalityApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    id: number;
    request_type: string;
    description: string;
    purpose: string;
    value: string | number;
    company_of_giver: string;
    proposed_date: string;
    mtl_receiving_staff_by?: string | null;
    mtl_receiving_staff_by_date?: string | null;
    mtl_receiving_staff_by_status?: string | null;
    verified_by?: string | null;
    verified_by_date?: string | null;
    verified_by_status?: string | null;
    acknowledged_by?: string | null;
    acknowledged_by_date?: string | null;
    acknowledged_by_status?: string | null;
    ims_acknowledged_by?: string | null;
    ims_acknowledged_by_date?: string | null;
    ims_acknowledged_by_status?: string | null;
    approved_by?: string | null;
    approved_by_date?: string | null;
    approved_by_status?: string | null;
    verified_by_id?: number | null;
    acknowledged_by_id?: number | null;
    approved_by_id?: number | null;
    create_by?: string;
    update_by?: string | null;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    [key: string]: any;
  };
}
