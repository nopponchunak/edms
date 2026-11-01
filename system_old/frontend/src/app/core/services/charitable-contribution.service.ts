import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfig } from '../config/api.config';
import { CharitableContribution, CreateCharitableContributionRequest, UpdateCharitableContributionRequest, ApproveRequest, UpdateStatusDto } from '../models/charitable-contribution.model';

@Injectable({
    providedIn: 'root'
})
export class CharitableContributionService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    create(data: CreateCharitableContributionRequest): Observable<CharitableContribution> {
        return this.http.post<CharitableContribution>(this.apiConfig.buildUrl('api/charitable_contributions'), data);
    }

    findAll(): Observable<CharitableContribution[]> {
        return this.http.get<CharitableContribution[]>(this.apiConfig.buildUrl('api/charitable-contributions'));
    }

    /**
     * Get paginated charitable contributions list using POST /api/charitable_contributions_page
     */
    findAllPaginated(request: CharitableContributionsPageRequest): Observable<CharitableContributionsPageResponse> {
        return this.http.post<CharitableContributionsPageApiResponse>(this.apiConfig.buildUrl('api/charitable_contributions_page'), request).pipe(
            map(response => this.transformCharitableContributionsPageResponse(response))
        );
    }

    findMyRequests(): Observable<CharitableContribution[]> {
        return this.http.get<CharitableContribution[]>(this.apiConfig.buildUrl('api/charitable-contributions/my-requests'));
    }

    findOne(id: string): Observable<CharitableContribution> {
        return this.http.get<CharitableContributionApiResponse>(this.apiConfig.buildUrl(`api/charitable_contributions/${id}`)).pipe(
            map(response => this.transformCharitableContributionApiResponse(response))
        );
    }

    update(id: string, data: UpdateCharitableContributionRequest): Observable<CharitableContribution> {
        return this.http.put<CharitableContributionApiResponse>(this.apiConfig.buildUrl(`api/charitable_contributions/${id}`), data).pipe(
            map(response => this.transformCharitableContributionApiResponse(response))
        );
    }

    action(id: string, type: string, decision: string): Observable<CharitableContribution> {
        return this.http.patch<CharitableContributionApiResponse>(
            this.apiConfig.buildUrl(`api/charitable_contributions/${id}/actions/${type}`),
            { decision }
        ).pipe(map(response => this.transformCharitableContributionApiResponse(response)));
    }

    delete(id: string): Observable<void> {
        return this.http.delete<void>(this.apiConfig.buildUrl(`api/charitable_contributions/${id}`));
    }

    submit(id: string): Observable<CharitableContribution> {
        return this.http.post<CharitableContribution>(this.apiConfig.buildUrl(`api/charitable-contributions/${id}/submit`), {});
    }

    verify(id: string, approveData: ApproveRequest): Observable<CharitableContribution> {
        return this.http.post<CharitableContribution>(this.apiConfig.buildUrl(`api/charitable-contributions/${id}/verify`), approveData);
    }

    acknowledge(id: string, approveData: ApproveRequest): Observable<CharitableContribution> {
        return this.http.post<CharitableContribution>(this.apiConfig.buildUrl(`api/charitable-contributions/${id}/acknowledge`), approveData);
    }

    approve(id: string, approveData: ApproveRequest): Observable<CharitableContribution> {
        return this.http.post<CharitableContribution>(this.apiConfig.buildUrl(`api/charitable-contributions/${id}/approve`), approveData);
    }

    /**
     * Update status using PUT /api/update_status/{id}
     */
    updateStatus(id: string, updateStatusDto: UpdateStatusDto): Observable<any> {
        return this.http.put<any>(this.apiConfig.buildUrl(`api/update_status/${id}`), updateStatusDto);
    }

    /**
     * Transform API response to match CharitableContribution model structure
     */
    private transformCharitableContributionsPageResponse(response: CharitableContributionsPageApiResponse): CharitableContributionsPageResponse {
        return {
            currentPage: response.data.current_page,
            data: response.data.data.map(item => this.transformCharitableContributionItem(item)),
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
     * Transform single charitable contribution API response to CharitableContribution model
     */
    private transformCharitableContributionApiResponse(response: CharitableContributionApiResponse): CharitableContribution {
        const item = response.data;
        return this.transformCharitableContributionItem(item);
    }

    /**
     * Transform charitable contribution item from snake_case to camelCase
     */
    private transformCharitableContributionItem(item: any): CharitableContribution {
        const workflowEmployeeNames: Record<string, { name: string; title: string }> = {};
        for (const field of [
            'acsc_by',
            'ims_acknowledged_by',
            'approver_by',
            'approver_by_2',
            'acsl_by',
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
            requestType: item.request_type as any,
            eventDescription: item.event_description,
            eventPurpose: item.event_purpose,
            organizerName: item.organizer_name,
            contributionDescription: item.contribution_description || '',
            valueAmount: typeof item.value_amount === 'string' ? parseFloat(item.value_amount) : item.value_amount,
            currencyCode: item.currency_code || item.currency || 'THB',
            proposedDate: item.proposed_date,
            vatAmount: typeof item.vat_amount === 'string' ? parseFloat(item.vat_amount) : (item.vat_amount || 0),
            status: item.status || null,

            // ACSC By fields
            acscBy: item.acsc_by || null,
            acscByDate: item.acsc_by_date || null,
            acscByStatus: item.acsc_by_status || null,

            // ACSL By fields
            acslBy: item.acsl_by || null,
            acslByDate: item.acsl_by_date || null,
            acslByStatus: item.acsl_by_status || null,
            imsAcknowledgedBy: item.ims_acknowledged_by || null,
            imsAcknowledgedByDate: item.ims_acknowledged_by_date || null,
            imsAcknowledgedByStatus: item.ims_acknowledged_by_status || null,
            workflowEmployeeNames,

            // Approver By fields
            approverBy: item.approver_by || null,
            approverByDate: item.approver_by_date || null,
            approverByStatus: item.approver_by_status || null,
            approverBy2: item.approver_by_2 || null,
            approverBy2Date: item.approver_by_2_date || null,
            approverBy2Status: item.approver_by_2_status || null,

            // Legacy fields
            requestedBy: item.requested_by || { id: '', firstName: '', lastName: '', email: '' },
            requestedById: item.requested_by_id || '',
            requestedDate: item.requested_date || item.created_at,
            selectedAcscId: item.selected_acsc_id || item.acsc_by || '',
            selectedAcslId: item.selected_acsl_id || item.acsl_by || '',
            selectedApproverId: item.selected_approver_id || item.approver_by || '',
            selectedApprover2Id: item.selected_approver_2_id || item.approver_by_2 || '',

            // Audit fields
            createBy: item.create_by,
            updateBy: item.update_by || null,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            deletedAt: item.deleted_at || null
        };
    }
}

// Interfaces for charitable contributions page API
export interface CharitableContributionsPageRequest {
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

export interface CharitableContributionsPageResponse {
    currentPage: number;
    data: CharitableContribution[];
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

interface CharitableContributionsPageApiResponse {
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

interface CharitableContributionApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: {
        id: number;
        request_type: string;
        event_description: string;
        event_purpose: string;
        organizer_name: string;
        contribution_description: string;
        value_amount: string | number;
        currency_code?: string;
        currency?: string;
        vat_amount: string | number;
        proposed_date: string;
        acsc_by?: string | null;
        acsc_by_date?: string | null;
        acsc_by_status?: string | null;
        acsl_by?: string | null;
        acsl_by_date?: string | null;
        acsl_by_status?: string | null;
        ims_acknowledged_by?: string | null;
        ims_acknowledged_by_date?: string | null;
        ims_acknowledged_by_status?: string | null;
        approver_by?: string | null;
        approver_by_date?: string | null;
        approver_by_status?: string | null;
        approver_by_2?: string | null;
        approver_by_2_date?: string | null;
        approver_by_2_status?: string | null;
        acsc_id?: number | null;
        acsl_id?: number | null;
        approver_id?: number | null;
        approver_2_id?: number | null;
        status: string | null;
        create_by?: string;
        update_by?: string | null;
        created_at: string;
        updated_at: string;
        deleted_at?: string | null;
        [key: string]: any;
    };
}



