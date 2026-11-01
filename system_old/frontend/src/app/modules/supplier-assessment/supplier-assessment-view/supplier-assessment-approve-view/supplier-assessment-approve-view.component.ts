import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';

import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ViewActionsComponent } from 'app/core/components/view-actions';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface SupplierAssessment {
  id: string;
  supplierName: string;
  assessmentDate: string;
  totalScore: number;
  status: 'draft' | 'submitted' | 'assessed' | 'approved' | 'rejected';
  assessedBy: string;
  approvedBy: string;
  comments?: string;
  createdAt: string;
  updatedAt: string;

  // ====== ฟิลด์เพิ่มเติมสำหรับ "เอกสารฟอร์ม" ======
  itemSupplied: string;
  informationUsed: {
    companyProfile: boolean;
    projectReference: boolean;
    siteVisit: boolean;
    prevAssessmentRecord: boolean;
    prevEvaluationRecord: boolean;
    isoCertificates: boolean;
  };
  assessmentAreas: {
    name: string;
    score: number;
    criteriaPoor: string;
    criteriaFair: string;
    criteriaGood: string;
    criteriaExcellent: string;
  }[];
  references: { name: string; opinion: string }[];
  recommendation: {
    accept: boolean;
    reason: string;
  };
  approvedSupplier: {
    isApproved: boolean;
    remark: string;
  };
  signoff: {
    assessedBy: string;
    assessedDate: string;
    approvedBy: string;
    approvedDate: string;
    acknowledgedBy: string;
    acknowledgedDate: string;
  };
  attachments: { fileName: string; size: string }[];
}

@Component({
  selector: 'app-supplier-assessment-approve-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatRadioModule,
    FuseAlertComponent,
    ViewActionsComponent
  ],
  templateUrl: './supplier-assessment-approve-view.component.html'
})
export class SupplierAssessmentApproveViewComponent implements OnInit {
  assessment: SupplierAssessment | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  // ฟอร์มอนุมัติ (MD / Director review)
  approvalComments = '';
  approvalDecision: 'approve' | 'decline' | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.loadAssessment(params['id']);
      }
    });
  }

  // ===== MOCK DATA ให้เหมือนรูปฟอร์มจริง =====
  private loadAssessment(id: string): void {
    this.isLoading = true;

    setTimeout(() => {
      this.assessment = {
        id,
        supplierName: 'ABC Construction Ltd.',
        assessmentDate: '2024-01-15',
        totalScore: 24,
        status: 'submitted',      // สถานะตอนส่งให้ Review
        assessedBy: 'David Assessor',
        approvedBy: '',
        comments:
          'Good performance overall. Supplier demonstrated excellent quality control and timely delivery.',
        createdAt: '2024-01-10',
        updatedAt: '2024-01-15',

        itemSupplied:
          'Electrical switchboards, cable trays and accessories for HVAC and lighting system.',

        informationUsed: {
          companyProfile: true,
          projectReference: true,
          siteVisit: true,
          prevAssessmentRecord: false,
          prevEvaluationRecord: true,
          isoCertificates: true
        },

        assessmentAreas: [
          {
            name: 'Experience since establishment',
            score: 8,
            criteriaPoor: '1–2',
            criteriaFair: '3–5',
            criteriaGood: '6–8',
            criteriaExcellent: '9–10'
          },
          {
            name: 'Fully qualified staff',
            score: 7,
            criteriaPoor: '1–4',
            criteriaFair: '5–10',
            criteriaGood: '11–20',
            criteriaExcellent: '20+ staff'
          },
          {
            name: 'Product compliances with accepted standards',
            score: 9,
            criteriaPoor: 'Poor',
            criteriaFair: 'Fair',
            criteriaGood: 'Good',
            criteriaExcellent: 'Excellent'
          }
        ],

        references: [
          {
            name: 'ABC Hospital Expansion',
            opinion:
              'Very good performance. On-time delivery and good coordination with site team.'
          },
          {
            name: 'XYZ Office Tower',
            opinion:
              'Satisfactory performance. Minor delays but overall acceptable quality.'
          }
        ],

        recommendation: {
          accept: true,
          reason:
            'Supplier meets the minimum score requirement and has at least one positive external reference.'
        },

        approvedSupplier: {
          isApproved: true,
          remark:
            'Approved to be included in the Approved Supplier List for electrical materials.'
        },

        signoff: {
          assessedBy: 'David Assessor',
          assessedDate: '2024-01-15',
          approvedBy: 'Jane Director',
          approvedDate: '2024-01-16',
          acknowledgedBy: 'Internal Management Representative',
          acknowledgedDate: '2024-01-17'
        },

        attachments: [
          { fileName: 'Company_Profile_ABC.pdf', size: '420.5 KB' },
          { fileName: 'ISO_9001_14001_Certificates.pdf', size: '312.8 KB' }
        ]
      };

      this.isLoading = false;
    }, 800);
  }

  // ===== ปุ่มอนุมัติ / ไม่อนุมัติ =====
  onApprove(): void {
    if (!this.approvalDecision) {
      this.showAlert('error', 'Please select an approval decision');
      return;
    }

    const confirmation = this.fuseConfirmationService.open({
      title: 'Confirm review',
      message: `Are you sure you want to ${this.approvalDecision === 'approve' ? 'approve' : 'decline'} this assessment?`,
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        cancel: { show: true, label: 'Cancel' },
        confirm: { show: true, label: 'Confirm', color: 'primary' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;
      // TODO: เรียก API จริง พร้อม approvalComments
      this.showAlert(
        'success',
        this.approvalDecision === 'approve'
          ? 'Assessment approved successfully!'
          : 'Assessment declined successfully!'
      );
      setTimeout(() => {
        this.router.navigate(['/supplier-assessment'], {
          queryParams: { tab: 'action' }
        });
      }, 1500);
    });
  }

  onBack(): void {
    this.router.navigate(['/supplier-assessment'], {
      queryParams: { tab: 'action' }
    });
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'assessed':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'assessed':
        return 'Assessed';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }
}
