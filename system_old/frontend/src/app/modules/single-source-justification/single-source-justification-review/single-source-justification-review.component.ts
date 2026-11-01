import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, map, Subject, switchMap, takeUntil } from 'rxjs';
import { EmployeeService } from 'app/core/services/employee.service';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ApiService } from 'app/core/services/api.service';
import { getAttachmentUrl } from 'app/core/utils/attachment-url.util';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface SingleSourceJustificationReview {
  id: number;
  subConsultantSupplierName: string;
  itemsSupplied: string;
  justificationType: 'single_source' | 'price_justification' | 'single-source' | 'price-justification';
  circumstances: string;
  alternativesConsidered: number;
  alternativesReason?: string | null;
  comments?: string | null;
  rationale: string;
  correspondingPO?: string | null;
  assessedBy?: string | null;
  assessedByDate?: string | null;
  assessedByStatus?: string | null;
  verifyBy?: string | null;
  verifyByDate?: string | null;
  verifyByStatus?: string | null;
  verifyByComment?: string | null;
  approvedBy?: string | null;
  approvedByDate?: string | null;
  approvedByStatus?: string | null;
  approvedByComments?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedByDate?: string | null;
  acknowledgedByStatus?: string | null;
  acknowledgedByComments?: string | null;
  createBy: string | null;
  updateBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Paths from API; use getAttachmentUrl(path) for display link */
  attachments?: string[];
}

@Component({
  selector: 'app-single-source-justification-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatRadioModule,
    FuseAlertComponent,
  ],
  templateUrl: './single-source-justification-review.component.html',
})
export class SingleSourceJustificationReviewComponent implements OnInit, OnDestroy {
  id!: string;
  actionType?: string; // assessed_by_status, approved_by_status, acknowledged_by_status
  isLoading = false;
  justification: SingleSourceJustificationReview | null = null;
  alert: { type: FuseAlertType; message: string } | null = null;
  projectTypes: any[] = [];
  employeeLookup = new Map<string, string>();
  employeeLookupWithTitle = new Map<string, string>();
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  /** ฟอร์มส่วน Approval Decision */
  approvalDecision: '' | 'approve' | 'decline' = '';
  approvalComments = '';
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private employeeService: EmployeeService,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  getAttachmentUrl = getAttachmentUrl;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.actionType = this.route.snapshot.paramMap.get('actionType') ?? undefined;

    if (!this.id) {
      this.showAlert('error', 'Invalid justification ID.');
      return;
    }

    this.loadJustification(this.id);
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  /** โหลดข้อมูลจาก API */
  loadJustification(id: string): void {
    this.isLoading = true;

    forkJoin({
      response: this.apiService.getSingleSourceJustification(id),
      employeeLookup: this.employeeService.getEmployeeLookupMap(),
      employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle(),
      projectTypesResp: this.apiService.getProjectTypes()
    }).pipe(
      switchMap(({ response, employeeLookup, employeeLookupWithTitle, projectTypesResp }) => {
        const data = response?.data;
        if (!data) return forkJoin({ response: Promise.resolve(response), employeeLookup: Promise.resolve(employeeLookup), employeeLookupWithTitle: Promise.resolve(employeeLookupWithTitle), projectTypesResp: Promise.resolve(projectTypesResp) });

        const codes = [
          data.assessed_by,
          data.verify_by,
          data.approved_by,
          data.acknowledged_by,
          data.create_by,
          data.update_by
        ].filter(code => !!code);

        return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
          switchMap(updatedLookup => {
            return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
              map(updatedLookupWithTitle => ({ response, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle, projectTypesResp }))
            );
          })
        );
      }),
      takeUntil(this._unsubscribeAll)
    ).subscribe({
      next: ({ response, employeeLookup, employeeLookupWithTitle, projectTypesResp }) => {
        this.employeeLookup = employeeLookup;
        this.employeeLookupWithTitle = employeeLookupWithTitle;
        if (projectTypesResp?.status && Array.isArray(projectTypesResp.data)) {
          this.projectTypes = projectTypesResp.data;
        }

        if (response.status && response.data) {
          const data = response.data;
        this.justification = {
            id: data.id,
            subConsultantSupplierName: data.sub_consultant_supplier_name || '',
            itemsSupplied: data.items_supplied || '',
            justificationType: data.justification_type || 'single_source',
            circumstances: data.circumstances_selection || '',
            alternativesConsidered: data.alternatives_considered || 0,
            alternativesReason: data.reason_no_alternatives,
            comments: data.comments,
            rationale: data.rationale_selection || '',
            correspondingPO: data.corresponding_po_no,
            assessedBy: data.assessed_by,
            assessedByDate: data.assessed_by_date,
            assessedByStatus: data.assessed_by_status,
            verifyBy: data.verify_by,
            verifyByDate: data.verify_by_date,
            verifyByStatus: data.verify_by_status,
            verifyByComment: data.verify_by_comment,
            approvedBy: data.approved_by,
            approvedByDate: data.approved_by_date,
            approvedByStatus: data.approved_by_status,
            approvedByComments: data.approved_by_comments,
            acknowledgedBy: data.acknowledged_by,
            acknowledgedByDate: data.acknowledged_by_date,
            acknowledgedByStatus: data.acknowledged_by_status,
            acknowledgedByComments: data.acknowledged_by_comments,
            createBy: data.create_by,
            updateBy: data.update_by,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            attachments: Array.isArray(data.attachments) ? data.attachments : []
        };
      } else {
          this.showAlert('error', response.message || 'Failed to load justification');
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading justification:', error);
        this.showAlert('error', 'Failed to load justification. Please try again.');
      this.isLoading = false;
      }
    });
  }

  /** ปุ่ม Back + Cancel */
  onBack(): void {
    this.router.navigate(['/single-source-justification']);
  }

  getItemSuppliedLabel(code: string): string {
    if (!code || code === '-') return '-';
    const projectType = this.projectTypes.find((pt: any) => pt.code === code);
    if (projectType) {
      return `${projectType.code} - ${projectType.name}`;
    }
    return code;
  }

  /** ปุ่ม Approve Review / Decline Review */
  onApprove(): void {
    if (!this.justification || !this.approvalDecision) {
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

      this.isLoading = true;

    // กำหนด field ที่จะ update ตาม action type
    // ต้องส่งข้อมูลที่จำเป็นทั้งหมดตามที่ API ต้องการ (เหมือน form component)
    const updateData: any = {
      // Required fields - ต้องส่งข้อมูลเดิมทั้งหมด
      sub_consultant_supplier_name: this.justification.subConsultantSupplierName,
      items_supplied: this.justification.itemsSupplied,
      justification_type: this.justification.justificationType === 'single-source' ? 'single_source' :
                         this.justification.justificationType === 'price-justification' ? 'price_justification' :
                         this.justification.justificationType,
      circumstances_selection: this.justification.circumstances,
      alternatives_considered: this.justification.alternativesConsidered || 0,
      reason_no_alternatives: this.justification.alternativesReason || null,
      comments: this.justification.comments || null,
      rationale_selection: this.justification.rationale,
      corresponding_po_no: this.justification.correspondingPO || null,

      // Approval workflow fields - เก็บค่าดั้งเดิมไว้ก่อน
      assessed_by: this.justification.assessedBy || null,
      assessed_by_date: this.justification.assessedByDate || null,
      assessed_by_status: this.justification.assessedByStatus || null,
      verify_by: this.justification.verifyBy || null,
      verify_by_date: this.justification.verifyByDate || null,
      verify_by_status: this.justification.verifyByStatus || null,
      verify_by_comment: this.justification.verifyByComment || null,
      approved_by: this.justification.approvedBy || null,
      approved_by_date: this.justification.approvedByDate || null,
      approved_by_status: this.justification.approvedByStatus || null,
      approved_by_comments: this.justification.approvedByComments || null,
      acknowledged_by: this.justification.acknowledgedBy || null,
      acknowledged_by_date: this.justification.acknowledgedByDate || null,
      acknowledged_by_status: this.justification.acknowledgedByStatus || null,
      acknowledged_by_comments: this.justification.acknowledgedByComments || null,
    };

    const status = this.approvalDecision === 'approve' ? 'approve' : 'reject';
    const today = new Date().toISOString().split('T')[0];

    // กำหนด field ที่จะ update ตาม action type หรือจาก route parameter
    if (this.actionType === 'verify_by_status' || (!this.actionType && !this.justification.verifyByStatus)) {
      updateData.verify_by_status = status;
      updateData.verify_by_date = today;
      updateData.verify_by_comment = this.approvalComments || null;
    } else if (this.actionType === 'approved_by_status' || (!this.actionType && !this.justification.approvedByStatus)) {
      updateData.approved_by_status = status;
      updateData.approved_by_date = today;
      updateData.approved_by_comments = this.approvalComments || null;
      // TODO: ต้องเพิ่ม approved_by จาก current user
    } else if (this.actionType === 'acknowledged_by_status' || (!this.actionType && !this.justification.acknowledgedByStatus)) {
      updateData.acknowledged_by_status = status;
      updateData.acknowledged_by_date = today;
      updateData.acknowledged_by_comments = this.approvalComments || null;
      // TODO: ต้องเพิ่ม acknowledged_by จาก current user
    } else {
      // ถ้าไม่ระบุ action type ให้ update ตามลำดับ workflow
      if (!this.justification.verifyByStatus) {
        updateData.verify_by_status = status;
        updateData.verify_by_date = today;
        updateData.verify_by_comment = this.approvalComments || null;
      } else if (!this.justification.approvedByStatus) {
        updateData.approved_by_status = status;
        updateData.approved_by_date = today;
        updateData.approved_by_comments = this.approvalComments || null;
      } else if (!this.justification.acknowledgedByStatus) {
        updateData.acknowledged_by_status = status;
        updateData.acknowledged_by_date = today;
        updateData.acknowledged_by_comments = this.approvalComments || null;
      }
    }

    this.apiService.updateSingleSourceJustification(this.justification.id, updateData).subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.status) {
          const text = this.approvalDecision === 'decline'
        ? 'Review has been declined.'
        : 'Review has been approved.';
    this.showAlert('success', text);

          // Reload data to show updated status
          setTimeout(() => {
            this.loadJustification(this.id);
            this.approvalDecision = '';
            this.approvalComments = '';
          }, 1000);
        } else {
          this.showAlert('error', response.message || 'Failed to submit review.');
        }
      },
      error: (error) => {
        console.error('Error submitting review:', error);
        this.isLoading = false;
        this.showAlert('error', error.error?.message || 'Failed to submit review. Please try again.');
      }
    });

    });
  }

  // ---------- helper สำหรับ template ----------

  /** Get status for item based on approval workflow */
  getStatusForItem(): string {
    if (!this.justification) return 'draft';

    if (this.justification.acknowledgedByStatus === 'approve' || this.justification.acknowledgedByStatus === 'approved') {
      return 'acknowledged';
    }
    if (this.justification.approvedByStatus === 'approve' || this.justification.approvedByStatus === 'approved') {
      return 'approved';
    }
    if (this.justification.verifyByStatus === 'approve' || this.justification.verifyByStatus === 'approved') {
      return 'verified';
    }
    if (this.justification.assessedByStatus === 'approve' || this.justification.assessedByStatus === 'approved') {
      return 'assessed';
    }
    if (this.justification.assessedByStatus === 'reject' || this.justification.verifyByStatus === 'reject' || this.justification.approvedByStatus === 'reject' || this.justification.acknowledgedByStatus === 'reject') {
      return 'rejected';
    }
    return 'draft';
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'assessed':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'verified':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'acknowledged':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
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
      case 'assessed':
        return 'Assessed';
      case 'verified':
        return 'Verified';
      case 'approved':
        return 'Approved';
      case 'acknowledged':
        return 'Acknowledged';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  getJustificationTypeLabel(type: string): string {
    switch (type) {
      case 'single_source':
      case 'single-source':
        return 'Single Source';
      case 'price_justification':
      case 'price-justification':
        return 'Price Justification';
      default:
        return type;
    }
  }

  formatDate(date: Date | string | null | undefined): string {
    if (!date) return '-';
    try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
    } catch {
      return '-';
    }
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 5000);
  }
}
