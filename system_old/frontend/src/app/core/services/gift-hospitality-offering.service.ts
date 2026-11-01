import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';
import {
  GiftHospitalityOffering,
  CreateGiftHospitalityOfferingDto,
  UpdateGiftHospitalityOfferingDto,
  VerifyRequestDto,
  AcknowledgeRequestDto,
  ApproveRequestDto,
  UpdateStatusDto
} from 'app/core/models/gift-hospitality-offering.model';

@Injectable({
  providedIn: 'root'
})
export class GiftHospitalityOfferingService {
  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfig
  ) {}

  create(createOfferingDto: CreateGiftHospitalityOfferingDto): Observable<GiftHospitalityOffering> {
    return this.http.post<GiftHospitalityOffering>(this.apiConfig.buildUrl('api/gift_hospitality_offerings'), createOfferingDto);
  }

  findAll(): Observable<GiftHospitalityOffering[]> {
    return this.http.get<GiftHospitalityOffering[]>(this.apiConfig.buildUrl('api/gift-hospitality-offering'));
  }

  /**
   * Get paginated gift hospitality offerings list using POST /api/gift_hospitality_offerings_page
   */
  findAllPaginated(request: GiftHospitalityOfferingsPageRequest): Observable<GiftHospitalityOfferingsPageResponse> {
    return this.http.post<GiftHospitalityOfferingsPageApiResponse>(this.apiConfig.buildUrl('api/gift_hospitality_offerings_page'), request).pipe(
      map(response => this.transformGiftHospitalityOfferingsPageResponse(response))
    );
  }

  findMyRequests(): Observable<GiftHospitalityOffering[]> {
    return this.http.get<GiftHospitalityOffering[]>(this.apiConfig.buildUrl('api/gift-hospitality-offering/my'));
  }

  findPendingRequests(): Observable<GiftHospitalityOffering[]> {
    return this.http.get<GiftHospitalityOffering[]>(this.apiConfig.buildUrl('api/gift-hospitality-offering/pending'));
  }

  findOne(id: string): Observable<GiftHospitalityOffering> {
    return this.http.get<GiftHospitalityOfferingApiResponse>(this.apiConfig.buildUrl(`api/gift_hospitality_offerings/${id}`)).pipe(
      map(response => this.transformGiftHospitalityOfferingApiResponse(response))
    );
  }

  update(id: string, updateOfferingDto: UpdateGiftHospitalityOfferingDto): Observable<GiftHospitalityOffering> {
    return this.http.put<GiftHospitalityOfferingApiResponse>(this.apiConfig.buildUrl(`api/gift_hospitality_offerings/${id}`), updateOfferingDto).pipe(
      map(response => this.transformGiftHospitalityOfferingApiResponse(response))
    );
  }

  action(id: string, type: string, decision: string, comments?: string): Observable<GiftHospitalityOffering> {
    return this.http.patch<GiftHospitalityOfferingApiResponse>(
      this.apiConfig.buildUrl(`api/gift_hospitality_offerings/${id}/actions/${type}`),
      { decision, comments }
    ).pipe(map(response => this.transformGiftHospitalityOfferingApiResponse(response)));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.apiConfig.buildUrl(`api/gift_hospitality_offerings/${id}`));
  }

  verify(id: string, verifyDto: VerifyRequestDto): Observable<GiftHospitalityOffering> {
    return this.action(id, 'verified_by_status', 'approved', verifyDto.comments);
  }

  acknowledge(id: string, acknowledgeDto: AcknowledgeRequestDto): Observable<GiftHospitalityOffering> {
    return this.action(id, 'acknowledged_by_status', 'approved', acknowledgeDto.comments);
  }

  approve(id: string, approveDto: ApproveRequestDto): Observable<GiftHospitalityOffering> {
    return this.action(
      id,
      'approved_by_status',
      approveDto.approvedDecision ? 'approved' : 'rejected',
      approveDto.comments
    );
  }

  updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
    return this.http.put(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
  }

  /**
   * Transform API response to match GiftHospitalityOffering model structure
   */
  private transformGiftHospitalityOfferingsPageResponse(response: GiftHospitalityOfferingsPageApiResponse): GiftHospitalityOfferingsPageResponse {
    return {
      currentPage: response.data.current_page,
      data: response.data.data.map(item => this.transformGiftHospitalityOfferingItem(item)),
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
   * Transform single gift hospitality offering API response to GiftHospitalityOffering model
   */
  private transformGiftHospitalityOfferingApiResponse(response: GiftHospitalityOfferingApiResponse): GiftHospitalityOffering {
    const item = response.data;
    return this.transformGiftHospitalityOfferingItem(item);
  }

  /**
   * Transform gift hospitality offering item from snake_case to camelCase
   */
  private transformGiftHospitalityOfferingItem(item: any): GiftHospitalityOffering {
    const workflowEmployeeNames: Record<string, { name: string; title: string }> = {};
    for (const field of [
      'verified_by',
      'ims_acknowledged_by',
      'approved_by',
      'approved_by_2',
      'acknowledged_by',
      'create_by',
    ]) {
      const code = String(item[field] ?? '').trim();
      const name = String(item[`${field}_name`] ?? '').trim();
      if (code && name) {
        workflowEmployeeNames[code] = {
          name,
          title: String(item[`${field}_title`] ?? '').trim(),
        };
      }
    }

    return {
      id: String(item.id),
      type: (item.request_type === 'gift' ? 'Gift' : 'Hospitality') as 'Gift' | 'Hospitality',
      description: item.description,
      purpose: item.purpose,
      value: typeof item.value === 'string' ? parseFloat(item.value) : item.value,
      currencyCode: item.currency_code || item.currency || 'THB',
      receiverNameAndCompany: item.receiver_name_and_company,
      proposedDate: item.proposed_date,
      status: item.status || 'Pending' as any,
      // New workflow fields (using code)
      verifiedBy: item.verified_by || null,
      verifiedByDate: item.verified_by_date || null,
      verifiedByStatus: item.verified_by_status as any || null,
      acknowledgedBy: item.acknowledged_by || null,
      acknowledgedByDate: item.acknowledged_by_date || null,
      acknowledgedByStatus: item.acknowledged_by_status as any || null,
      imsAcknowledgedBy: item.ims_acknowledged_by || null,
      imsAcknowledgedByDate: item.ims_acknowledged_by_date || null,
      imsAcknowledgedByStatus: item.ims_acknowledged_by_status as any || null,
      workflowEmployeeNames,
      approvedBy: item.approved_by || null,
      approvedByDate: item.approved_by_date || null,
      approvedByStatus: item.approved_by_status as any || null,
      approvedBy2: item.approved_by_2 || null,
      approvedBy2Date: item.approved_by_2_date || null,
      approvedBy2Status: item.approved_by_2_status as any || null,
      attachments: Array.isArray(item.attachments) ? item.attachments : [],
      // Legacy fields (for backward compatibility)
      verifiedById: item.verified_by_id ? String(item.verified_by_id) : undefined,
      acknowledgedById: item.acknowledged_by_id ? String(item.acknowledged_by_id) : undefined,
      approvedById: item.approved_by_id ? String(item.approved_by_id) : undefined,
      // Default values for required fields
      requestedBy: item.requested_by || { id: '', firstName: '', lastName: '', email: '' },
      requestedDate: item.requested_date || item.created_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      version: item.version || 1,
      createBy: item.create_by,
      updateBy: item.update_by || null
    };
  }
}

// Interfaces for gift hospitality offerings page API
export interface GiftHospitalityOfferingsPageRequest {
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

export interface GiftHospitalityOfferingsPageResponse {
  currentPage: number;
  data: GiftHospitalityOffering[];
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

interface GiftHospitalityOfferingsPageApiResponse {
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

interface GiftHospitalityOfferingApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    id: number;
    request_type: string;
    description: string;
    purpose: string;
    value: string | number;
    currency_code?: string;
    currency?: string;
    receiver_name_and_company: string;
    proposed_date: string;
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
