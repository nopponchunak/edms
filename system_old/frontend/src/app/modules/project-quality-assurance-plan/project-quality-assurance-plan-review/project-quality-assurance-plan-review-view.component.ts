import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { FuseConfirmationService } from '@fuse/services/confirmation';

type Status =
  | 'draft' | 'submitted' | 'reviewed' | 'approved' | 'acknowledged'
  | 'proposal_reviewed' | 'contract_reviewed' | 'declined';

interface PqapViewModel {
  id: string;
  status: Status;

  revision?: string;
  date?: string;

  preparedBy?: string;      // (TL)
  approvedBy?: string;      // (DI)
  acknowledgedBy?: string;  // (VVE)

  projectName: string;
  projectNo: string;

  projectType?: string;
  clientName?: string;

  designReviewSchedule: Array<{
    item: string;
    review: boolean;
    verification: boolean;
    validation: boolean;
  }>;

  scopeOfServices: string[];

  projectTeam: { di?: string; tl?: string; pm?: string; cm?: string; re?: string; };

  projectCoordinators: Array<{ discipline: string; coordinator: string }>;

  vveReviewers: Array<{ discipline: string; reviewer: string }>;

  beforeDocumentsIssued?: boolean;
  within14DaysAfterDocumentsIssued?: boolean;

  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-pqap-review-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatInputModule,
    MatCardModule,         // << ใช้ใน template
    MatFormFieldModule,     // << ใช้ใน template
    ViewActionsComponent
  ],
  templateUrl: './project-quality-assurance-plan-review-view.component.html',
})
export class PqapReviewViewComponent implements OnInit {
  isLoading = false;
  plan: PqapViewModel | null = null;

  // <<< ให้ชื่อ property ตรงกับ HTML >>>
  approvalDecision: 'approve' | 'decline' | null = null;
  approvalComments = '';
  isSubmitting = false;

  constructor(private route: ActivatedRoute, private router: Router,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load(id);
  }

  private load(id: string) {
    this.isLoading = true;

    const mock: Record<string, PqapViewModel> = {
      '1': {
        id: '1',
        status: 'acknowledged',
        revision: 'Rev. A',
        date: '2024-01-15',
        preparedBy: 'John Smith (TL)',
        approvedBy: 'Jane Doe (DI)',
        acknowledgedBy: 'Mike Johnson (VVE)',

        projectName: 'New Hospital Complex',
        projectNo: 'MT2024001',
        projectType: 'Hospital',
        clientName: 'Bangkok Hospital Group',

        scopeOfServices: ['C&S', 'M&E', 'Facade', 'Lighting'],

        projectTeam: {
          di: 'Jane Doe (DI)',
          tl: 'John Smith (TL)',
          pm: 'Alice Brown (PM)',
          cm: 'Bob Green (CM)',
          re: 'Sarah Wilson (RE)',
        },

        projectCoordinators: [
          { discipline: 'C&S', coordinator: 'Tom Davis (C&S Coordinator)' },
          { discipline: 'M&E', coordinator: 'Lisa Chen (M&E Coordinator)' },
          { discipline: 'Facade', coordinator: 'David Lee (Facade Coordinator)' },
          { discipline: 'Lighting', coordinator: 'Emma White (Lighting Coordinator)' },
        ],

        vveReviewers: [
          { discipline: 'C&S', reviewer: 'Mike Johnson (VVE)' },
          { discipline: 'M&E', reviewer: 'Sarah Wilson (VVE)' },
          { discipline: 'Facade', reviewer: 'Tom Davis (VVE)' },
        ],

        designReviewSchedule: [
          { item: 'DCR/Design Brief/Conceptual Stage', review: true,  verification: false, validation: false },
          { item: 'Peer Review',                           review: true,  verification: true,  validation: false },
          { item: 'Submission Stage',                      review: true,  verification: true,  validation: false },
          { item: 'Tender Stage',                          review: true,  verification: false, validation: false },
          { item: 'Construction Stage',                    review: true,  verification: true,  validation: true  },
          { item: 'Final Design (for Transportation)',     review: true,  verification: true,  validation: true  },
          { item: 'Engineering Audit/Report',              review: true,  verification: true,  validation: true  },
        ],

        beforeDocumentsIssued: true,
        within14DaysAfterDocumentsIssued: false,

        createdAt: '2024-01-10',
        updatedAt: '2024-01-15',
      },
    };

    setTimeout(() => {
      this.plan = mock[id] ?? null;
      this.isLoading = false;
    }, 250);
  }

  onBack(): void {
    this.router.navigate(['/project-quality-assurance-plan/list']);
  }

  onEdit(): void {
    if (!this.plan) { return; }
    this.router.navigate(['/project-quality-assurance-plan/edit', this.plan.id]);
  }

  // <<< ให้ชื่อเมธอดตรงกับปุ่มใน HTML >>>
  onApprove(): void {
    if (!this.approvalDecision || !this.plan) { return; }
        const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: 'Are you sure you want to submit this review decision?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.isSubmitting = true;

    setTimeout(() => {
      const next = this.getNextStatus(this.approvalDecision, this.plan!.status);
      this.plan!.status = next;
      this.isSubmitting = false;
      this.onBack();
    }, 400);

    });
  }

  private getNextStatus(
    decision: 'approve' | 'decline',
    current: Status
  ): Status {
    if (decision === 'decline') return 'declined';
    if (current === 'submitted') return 'reviewed';
    if (current === 'proposal_reviewed') return 'contract_reviewed';
    if (current === 'contract_reviewed') return 'acknowledged';
    return 'approved';
  }

  getStatusLabel(s: Status): string {
    const map: Record<Status, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      reviewed: 'Reviewed',
      approved: 'Approved',
      acknowledged: 'Acknowledged',
      proposal_reviewed: 'Proposal Reviewed',
      contract_reviewed: 'Contract Reviewed',
      declined: 'Declined',
    };
    return map[s] ?? s;
  }

  getStatusBadgeClass(s: Status): string {
    switch (s) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'reviewed': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'acknowledged': return 'bg-purple-100 text-purple-800';
      case 'proposal_reviewed': return 'bg-amber-100 text-amber-800';
      case 'contract_reviewed': return 'bg-indigo-100 text-indigo-800';
      case 'declined': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  formatDate(d?: string): string {
    return formatDateDisplay(d);
  }
}
