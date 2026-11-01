import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ApiConfig } from 'app/core/config/api.config';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { Observable, map } from 'rxjs';

export interface DashboardSummary {
    my_requests_count: number;
    pending_my_action_count: number;
    pending_count: number;
    draft_count: number;
    rejected_count: number;
    completed_this_month_count: number;
}

export interface DashboardItem {
    id: string;
    formType: string;
    title: string;
    referenceNo: string;
    status: string;
    currentStep: string;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    viewUrl: string;
    actionUrl: string;
}

export interface PersonalDashboard {
    summary: DashboardSummary;
    actionItems: DashboardItem[];
    recentRequests: DashboardItem[];
    needRevision: DashboardItem[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
    constructor(
        private http: HttpClient,
        private apiConfig: ApiConfig
    ) {}

    getPersonalSummary(userCode = getCurrentUserCode() || ''): Observable<PersonalDashboard> {
        const params = new HttpParams().set('user_code', userCode);

        return this.http
            .get<any>(this.apiConfig.buildUrl('api/dashboard/personal-summary'), { params })
            .pipe(map((response) => this.normalize(response?.data)));
    }

    private normalize(data: any): PersonalDashboard {
        const summary = data?.summary ?? {};

        return {
            summary: {
                my_requests_count: Number(summary.my_requests_count ?? 0),
                pending_my_action_count: Number(summary.pending_my_action_count ?? 0),
                pending_count: Number(summary.pending_count ?? 0),
                draft_count: Number(summary.draft_count ?? 0),
                rejected_count: Number(summary.rejected_count ?? 0),
                completed_this_month_count: Number(summary.completed_this_month_count ?? 0),
            },
            actionItems: Array.isArray(data?.actionItems) ? data.actionItems : [],
            recentRequests: Array.isArray(data?.recentRequests) ? data.recentRequests : [],
            needRevision: Array.isArray(data?.needRevision) ? data.needRevision : [],
        };
    }
}
