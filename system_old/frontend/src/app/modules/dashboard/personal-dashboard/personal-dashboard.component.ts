import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import {
    DashboardItem,
    DashboardService,
    DashboardSummary,
    PersonalDashboard,
} from 'app/core/services/dashboard.service';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { finalize } from 'rxjs';

interface QuickCreateItem {
    label: string;
    route: string;
    icon: string;
    navId: string;
}

@Component({
    selector: 'app-personal-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
    ],
    templateUrl: './personal-dashboard.component.html',
    styleUrls: ['./personal-dashboard.component.scss'],
})
export class PersonalDashboardComponent implements OnInit {
    private readonly dashboardService = inject(DashboardService);
    readonly navigationPermissionService = inject(NavigationPermissionService);

    loading = false;
    errorMessage = '';
    userCode = getCurrentUserCode() || '';
    lastUpdated = new Date();

    summary: DashboardSummary = {
        my_requests_count: 0,
        pending_my_action_count: 0,
        pending_count: 0,
        draft_count: 0,
        rejected_count: 0,
        completed_this_month_count: 0,
    };

    actionItems: DashboardItem[] = [];
    recentRequests: DashboardItem[] = [];
    needRevision: DashboardItem[] = [];

    readonly quickCreateItems: QuickCreateItem[] = [
        {
            label: 'Purchase Requisition',
            route: '/purchase-requisition/new',
            icon: 'heroicons_outline:receipt-percent',
            navId: 'purchase-requisition',
        },
        {
            label: 'Expenses Claim',
            route: '/expenses-claim/new',
            icon: 'heroicons_outline:banknotes',
            navId: 'expenses-claim',
        },
        {
            label: 'Allowance After 10PM',
            route: '/allowance-after-10pm/new',
            icon: 'heroicons_outline:clock',
            navId: 'allowance-after-10pm',
        },
        {
            label: 'Charitable Contribution',
            route: '/charitable-contributions/new',
            icon: 'heroicons_outline:heart',
            navId: 'request-for-charitable-contributions-sponsorship',
        },
        {
            label: 'Proposal & Contract Review',
            route: '/proposal-contract-review/new',
            icon: 'heroicons_outline:document-duplicate',
            navId: 'proposal-contract-review',
        },
    ];

    ngOnInit(): void {
        this.loadDashboard();
    }

    loadDashboard(): void {
        this.loading = true;
        this.errorMessage = '';

        this.dashboardService
            .getPersonalSummary(this.userCode)
            .pipe(finalize(() => (this.loading = false)))
            .subscribe({
                next: (dashboard) => this.applyDashboard(dashboard),
                error: (error) => {
                    this.errorMessage =
                        error?.error?.message || 'Dashboard data could not be loaded.';
                    this.applyDashboard({
                        summary: this.summary,
                        actionItems: [],
                        recentRequests: [],
                        needRevision: [],
                    });
                },
            });
    }

    visibleQuickCreateItems(): QuickCreateItem[] {
        return this.quickCreateItems.filter((item) =>
            this.navigationPermissionService.hasCreatePermissionByNavId(item.navId)
        );
    }

    statusClass(status: string | null | undefined): string {
        const normalized = String(status || '').toLowerCase();

        if (['approved', 'approve', 'completed', 'done', 'contract_approved'].includes(normalized)) {
            return 'bg-green-50 text-green-700 ring-green-600/20';
        }

        if (['rejected', 'reject', 'declined'].includes(normalized)) {
            return 'bg-red-50 text-red-700 ring-red-600/20';
        }

        if (['draft'].includes(normalized)) {
            return 'bg-gray-100 text-gray-700 ring-gray-500/20';
        }

        return 'bg-amber-50 text-amber-700 ring-amber-600/20';
    }

    statusLabel(status: string | null | undefined): string {
        const value = String(status || 'pending')
            .replace(/_/g, ' ')
            .trim();

        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    trackByItemId(_: number, item: DashboardItem): string {
        return `${item.formType}-${item.id}`;
    }

    private applyDashboard(dashboard: PersonalDashboard): void {
        this.summary = dashboard.summary;
        this.actionItems = dashboard.actionItems;
        this.recentRequests = dashboard.recentRequests;
        this.needRevision = dashboard.needRevision;
        this.lastUpdated = new Date();
    }
}
