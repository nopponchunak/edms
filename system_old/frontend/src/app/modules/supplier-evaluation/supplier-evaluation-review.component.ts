import { Component, OnInit } from '@angular/core';
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
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface SupplierEvaluation {
  id: string;
  supplierName: string;
  projectName?: string;
  projectNo?: string;
  departmentInfo?: string; // Department / Purchased Value / Duration
  evaluatedDate: string;
  averageRating: number;
  status: 'draft' | 'submitted' | 'evaluated' | 'approved' | 'rejected';
  evaluatedBy: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationCriterion {
  no: number;
  item: string;
  rating: number;
  comment: string;
}

@Component({
  selector: 'app-supplier-evaluation-review',
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
    FuseAlertComponent
  ],
  templateUrl: './supplier-evaluation-review.component.html'
})
export class SupplierEvaluationReviewComponent implements OnInit {
  evaluation: SupplierEvaluation | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  /** Anti-corruption radio (Yes / No) */
  antiCorruption: 'yes' | 'no' | '' = '';

  /** ตาราง Evaluation 8 ข้อ */
  criteria: EvaluationCriterion[] = [];

  /** Decision: maintain / remove */
  decision: 'maintain' | 'remove' | '' = '';

  /** Sign-off mock data */
  signOff = {
    evaluatedBy: '',
    evaluatedDate: '',
    approvedBy: '',
    approvedDate: '',
    acknowledgedBy: '',
    acknowledgedDate: ''
  };

  /** Attached documents (mock) */
  attachments = [
    { name: 'Performance_Report_2023.pdf', type: 'PDF', sizeKB: 512.4 },
    { name: 'Contract_Copy.pdf', type: 'PDF', sizeKB: 233.1 }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.loadEvaluation(params['id']);
      }
    });
  }

  /** โหลดข้อมูล mock ให้เหมือนเปิดจากเอกสาร */
  private loadEvaluation(id: string): void {
    this.isLoading = true;

    setTimeout(() => {
      // header หลัก
      this.evaluation = {
        id,
        supplierName: 'ABC Construction Ltd.',
        projectName: 'New Bangkok Hospital Extension',
        projectNo: 'PRJ-2024-001',
        departmentInfo: 'Structural / 15,000,000 THB / 18 months',
        evaluatedDate: '2024-01-15',
        averageRating: 0, // จะคำนวณจาก criteria อีกที
        status: 'submitted',
        evaluatedBy: 'John Smith',
        approvedBy: '',
        createdAt: '2024-01-10',
        updatedAt: '2024-01-15'
      };

      // anti corruption mock
      this.antiCorruption = 'no';

      // criteria 8 ข้อ
      this.criteria = [
        {
          no: 1,
          item: 'Quality and Accuracy of Document',
          rating: 8,
          comment: 'Drawings and documents are generally accurate with minor revisions.'
        },
        {
          no: 2,
          item: 'Timeliness of Documentation',
          rating: 7,
          comment: 'Most deliverables submitted on time, a few were slightly delayed.'
        },
        {
          no: 3,
          item: "Understanding of MTL's Needs",
          rating: 9,
          comment: 'Supplier understands project requirements very well.'
        },
        {
          no: 4,
          item: 'Cooperation and Responsiveness of Frontline Staff',
          rating: 8,
          comment: 'Good cooperation, quick response to queries.'
        },
        {
          no: 5,
          item: 'Timeliness of Delivery',
          rating: 7,
          comment: 'Delivery generally on schedule.'
        },
        {
          no: 6,
          item: 'Quality of Products',
          rating: 9,
          comment: 'Product quality meets expectations and specifications.'
        },
        {
          no: 7,
          item: 'Meet EMS / OHSMS Requirements',
          rating: 8,
          comment: 'Complied with safety and environmental requirements.'
        },
        {
          no: 8,
          item: 'Others',
          rating: 7,
          comment: 'Overall satisfied with supplier performance.'
        }
      ];

      // คำนวณค่าเฉลี่ย
      if (this.evaluation) {
        this.evaluation.averageRating = this.averageScore;
      }

      // sign-off mock
      this.signOff = {
        evaluatedBy: 'John Smith',
        evaluatedDate: '2024-01-16',
        approvedBy: 'Jane Doe (MD/DI/TL)',
        approvedDate: '2024-01-18',
        acknowledgedBy: 'Michael Lee (IMR)',
        acknowledgedDate: '2024-01-20'
      };

      // decision mock: maintain
      this.decision = 'maintain';

      this.isLoading = false;
    }, 800);
  }

  /** ค่าเฉลี่ยจาก criteria */
  get averageScore(): number {
    if (!this.criteria || this.criteria.length === 0) {
      return 0;
    }
    const sum = this.criteria.reduce((acc, c) => acc + (c.rating || 0), 0);
    return +(sum / this.criteria.length).toFixed(1);
  }

  /** กด Cancel */
  onCancel(): void {
    this.router.navigate(['/supplier-evaluation'], {
      queryParams: { tab: 'action' }
    });
  }

  /** กด Submit (mock) */
  onSubmit(): void {
    if (!this.decision) {
      this.showAlert('error', 'Please select a decision before submitting.');
      return;
    }

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
      // ตรงนี้ในอนาคตค่อยไป call API ส่งค่าฟอร์ม
      this.showAlert('success', 'Review submitted successfully (mock).');
    });
  }

  onBack(): void {
    this.onCancel();
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 5000);
  }

  // ===== Helper สำหรับ UI =====

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'evaluated':
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
      case 'evaluated':
        return 'Evaluated';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatDate(dateString?: string | null): string {
    if (!dateString) return '-';
    const d = new Date(dateString);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }
}
