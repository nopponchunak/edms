import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Car, CreateCarRequest, UpdateCarRequest, DispositionRequest, FollowUpRequest, ImrReviewRequest } from '../models/car.model';
import { ApiConfig } from '../config/api.config';

@Injectable({
    providedIn: 'root'
})
export class CarService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    create(data: CreateCarRequest): Observable<Car> {
        return this.http.post<Car>(this.apiConfig.buildUrl('api/cars'), data);
    }

    getNextRefNo(date?: string | null): Observable<string> {
        const query = date ? `?date=${encodeURIComponent(date)}` : '';

        return this.http
            .get<{ success?: boolean; data?: { next_ref_no?: string; next_number?: string } }>(
                this.apiConfig.buildUrl(`api/cars/next-number${query}`)
            )
            .pipe(map(response => response?.data?.next_ref_no || response?.data?.next_number || ''));
    }

    findAll(): Observable<Car[]> {
        return this.http.get<Car[]>(this.apiConfig.buildUrl('api/cars'));
    }

    /**
     * Get paginated cars list using POST /api/cars_page
     */
    findAllPaginated(request: CarsPageRequest): Observable<CarsPageResponse> {
        return this.http.post<CarsPageApiResponse>(this.apiConfig.buildUrl('api/cars_page'), request).pipe(
            map(response => this.transformCarsPageResponse(response, request))
        );
    }

    findMyCars(): Observable<Car[]> {
        return this.http.get<Car[]>(this.apiConfig.buildUrl('api/cars/my-cars'));
    }

    findOne(id: string): Observable<Car> {
        return this.http.get<CarApiResponse>(this.apiConfig.buildUrl(`api/cars/${id}`)).pipe(
            map(response => this.transformCarApiResponse(response))
        );
    }

    update(id: string, data: UpdateCarRequest): Observable<Car> {
        return this.http.put<CarApiResponse>(this.apiConfig.buildUrl(`api/cars/${id}`), data).pipe(
            map(response => this.transformCarApiResponse(response))
        );
    }

    delete(id: string): Observable<void> {
        return this.http.delete<void>(this.apiConfig.buildUrl(`api/cars/${id}`));
    }

    issue(id: string): Observable<Car> {
        return this.http.post<Car>(this.apiConfig.buildUrl(`api/cars/${id}/issue`), {});
    }

    submitDisposition(id: string, dispositionData: DispositionRequest): Observable<Car> {
        return this.http.post<Car>(this.apiConfig.buildUrl(`api/cars/${id}/disposition`), dispositionData);
    }

    submitFollowUp(id: string, followUpData: FollowUpRequest): Observable<Car> {
        return this.http.post<Car>(this.apiConfig.buildUrl(`api/cars/${id}/follow-up`), followUpData);
    }

    submitImrReview(id: string, imrReviewData: ImrReviewRequest): Observable<Car> {
        return this.http.post<Car>(this.apiConfig.buildUrl(`api/cars/${id}/imr-review`), imrReviewData);
    }

    getSlaInfo(id: string): Observable<{ isOverdue: boolean; daysOverdue: number; slaHours: number }> {
        return this.http.get<{ isOverdue: boolean; daysOverdue: number; slaHours: number }>(this.apiConfig.buildUrl(`api/cars/${id}/sla-info`));
    }

    /**
     * Transform single car API response to Car model
     */
    private transformCarApiResponse(response: CarApiResponse): Car {
        const item = response.data;
        return this.transformCarItem(item);
    }

    /**
     * Transform API response to match Car model structure
     */
    private transformCarsPageResponse(response: CarsPageApiResponse, request?: CarsPageRequest): CarsPageResponse {
        // Handle new API response structure (direct response with draw, recordsTotal, data array)
        if ('draw' in response && 'recordsTotal' in response) {
            const newResponse = response as CarsPageApiResponseNew;
            const start = request?.start || 0;
            const length = request?.length || 10;
            const recordsTotal = newResponse.recordsTotal || 0;
            const dataArray = newResponse.data || [];
            
            return {
                currentPage: Math.floor(start / length) + 1,
                data: dataArray.map(item => this.transformCarItem(item)),
                firstPageUrl: '',
                from: start + 1,
                lastPage: Math.ceil(recordsTotal / length) || 1,
                lastPageUrl: '',
                links: [],
                nextPageUrl: null,
                path: '',
                perPage: length,
                prevPageUrl: null,
                to: start + dataArray.length,
                total: recordsTotal
            };
        }
        
        // Handle old API response structure (wrapped in data object)
        if ('code' in response && 'data' in response && typeof response.data === 'object' && 'current_page' in response.data) {
            const oldResponse = response as CarsPageApiResponseOld;
            return {
                currentPage: oldResponse.data.current_page,
                data: oldResponse.data.data.map(item => this.transformCarItem(item)),
                firstPageUrl: oldResponse.data.first_page_url,
                from: oldResponse.data.from,
                lastPage: oldResponse.data.last_page,
                lastPageUrl: oldResponse.data.last_page_url,
                links: oldResponse.data.links,
                nextPageUrl: oldResponse.data.next_page_url,
                path: oldResponse.data.path,
                perPage: oldResponse.data.per_page,
                prevPageUrl: oldResponse.data.prev_page_url,
                to: oldResponse.data.to,
                total: oldResponse.data.total
            };
        }
        
        // Fallback: empty response
        return {
            currentPage: 1,
            data: [],
            firstPageUrl: '',
            from: 0,
            lastPage: 1,
            lastPageUrl: '',
            links: [],
            nextPageUrl: null,
            path: '',
            perPage: 10,
            prevPageUrl: null,
            to: 0,
            total: 0
        };
    }

    /**
     * Transform car item from snake_case to camelCase
     * Handles both array and JSON string formats for sources and non_conformity_types
     */
    private transformCarItem(item: any): Car {
        // Parse sources - could be array or JSON string
        let sources: string[] = [];
        if (item.sources) {
            if (typeof item.sources === 'string') {
                try {
                    sources = JSON.parse(item.sources);
                } catch (e) {
                    sources = [];
                }
            } else if (Array.isArray(item.sources)) {
                sources = item.sources;
            }
        }

        // Parse non_conformity_types - could be array or JSON string
        let nonConformityTypes: string[] = [];
        if (item.non_conformity_types) {
            if (typeof item.non_conformity_types === 'string') {
                try {
                    nonConformityTypes = JSON.parse(item.non_conformity_types);
                } catch (e) {
                    nonConformityTypes = [];
                }
            } else if (Array.isArray(item.non_conformity_types)) {
                nonConformityTypes = item.non_conformity_types;
            }
        }

        return {
            id: String(item.id),
            department: item.department,
            projectName: item.project_name,
            refNo: item.ref_no,
            projectNo: item.project_no,
            to: item.to,
            date: item.date,
            carIssuedBy: item.car_issued_by,
            sources: sources as any,
            otherSourceDescription: item.other_source_description,
            severity: item.severity as any,
            nonConformityTypes: nonConformityTypes as any,
            nonConformityDescription: item.non_conformity_description,
            responsiblePersonId: item.responsible_person_id ? String(item.responsible_person_id) : undefined,
            imrId: item.imr_id ? String(item.imr_id) : undefined,
            status: item.status as any,
            issuerId: item.issuer_id ? String(item.issuer_id) : '',
            issuer: item.issuer || { id: '', firstName: '', lastName: '', email: '' },
            responsiblePerson: item.responsible_person || undefined,
            imr: item.imr || undefined,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            isDeleted: item.is_deleted || false,
            deletedAt: item.deleted_at,
            // Optional fields
            causeOfNonConformity: item.cause_of_non_conformity,
            remedialAction: item.remedial_action,
            correctiveAction: item.corrective_action,
            dueDate: item.due_date,
            completedBy: item.completed_by,
            completedByDate: item.completed_by_date,
            completedByStatus: item.completed_by_status,
            completedDate: item.completed_by_date, // Legacy alias
            acknowledgedBy: item.acknowledged_by,
            acknowledgedByDate: item.acknowledged_by_date,
            acknowledgedByStatus: item.acknowledged_by_status,
            acknowledgedDate: item.acknowledged_by_date, // Legacy alias
            raCaSatisfactory: item.ra_ca_satisfactory === 1 || item.ra_ca_satisfactory === true,
            raCaSatisfactoryDescription: item.ra_ca_satisfactory_description,
            furtherActionRequired: item.further_action_required === 1 || item.further_action_required === true,
            furtherActionDescription: item.further_action_description,
            verifiedBy: item.verified_by,
            verifiedByDate: item.verified_by_date,
            verifiedByStatus: item.verified_by_status,
            verifiedByDate2: item.verified_by_date_2,
            verifiedByStatus2: item.verified_by_status_2,
            verifiedDate: item.verified_by_date, // Legacy alias
            imrComments: item.imr_comments,
            responseTimeCheck: item.response_time_check === 1 || item.response_time_check === true,
            approvedBy: item.approved_by,
            approvedByDate: item.approved_by_date,
            approvedByStatus: item.approved_by_status,
            approvedByDate2: item.approved_by_date_2 ?? item.approve_by_date_2,
            approvedByStatus2: item.approved_by_status_2 ?? item.approve_by_status_2,
            approvedDate: item.approved_by_date // Legacy alias
        };
    }
}

// Interfaces for cars page API
export interface CarsPageRequest {
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

export interface CarsPageResponse {
    currentPage: number;
    data: Car[];
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

// New API response structure (direct response with draw, recordsTotal, data array)
interface CarsPageApiResponseNew {
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    data: any[];
}

// Old API response structure (wrapped in data object)
interface CarsPageApiResponseOld {
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

type CarsPageApiResponse = CarsPageApiResponseNew | CarsPageApiResponseOld;

interface CarApiResponse {
    code: string;
    status: boolean;
    message: string;
    data: {
        id: number;
        department: string;
        project_name: string;
        ref_no: string;
        project_no: string;
        to: string;
        date: string;
        car_issued_by: string;
        sources: string | string[]; // Can be JSON string or array
        other_source_description?: string | null;
        severity: string;
        non_conformity_types: string | string[]; // Can be JSON string or array
        non_conformity_description: string;
        cause_of_non_conformity?: string | null;
        remedial_action?: string | null;
        corrective_action?: string | null;
        imr_comments?: string | null;
        completed_by?: string | null;
        completed_by_date?: string | null;
        completed_by_status?: string | null;
        acknowledged_by?: string | null;
        acknowledged_by_date?: string | null;
        acknowledged_by_status?: string | null;
        verified_by?: string | null;
        verified_by_date?: string | null;
        verified_by_status?: string | null;
        verified_by_date_2?: string | null;
        verified_by_status_2?: string | null;
        approved_by?: string | null;
        approved_by_date?: string | null;
        approved_by_status?: string | null;
        approve_by_date_2?: string | null;
        approve_by_status_2?: string | null;
        approved_by_date_2?: string | null;
        approved_by_status_2?: string | null;
        response_time_check?: number | null;
        ra_ca_satisfactory?: number | null;
        ra_ca_satisfactory_description?: string | null;
        further_action_required?: number | null;
        further_action_description?: string | null;
        responsible_person_id?: number | null;
        imr_id?: number | null;
        create_by?: string | null;
        update_by?: string | null;
        created_at: string;
        updated_at: string;
        deleted_at?: string | null;
        [key: string]: any; // For other optional fields
    };
}
