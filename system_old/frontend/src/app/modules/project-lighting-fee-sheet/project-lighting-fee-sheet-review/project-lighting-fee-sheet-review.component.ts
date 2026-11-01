import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';

@Component({
  selector: 'app-project-lighting-fee-sheet-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    FuseAlertComponent
  ],
  templateUrl: './project-lighting-fee-sheet-review.component.html'
})
export class ProjectLightingFeeSheetReviewComponent implements OnInit {

  feeSheet: any = null;
  isLoading = true;
  alert: { type: FuseAlertType; message: string } | null = null;

  // Approval variables
  approvalDecision: string = '';
  approvalComments: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loadData(id);
  }

  loadData(id: string | null): void {
    setTimeout(() => {

      this.feeSheet = {
        id,
        status: 'approved',

        copiesTo: 'Accts.',
        circ: 'ADM/',
        chFile: 'LMT',
        fee: 'Fee',

        projectPNo: 'LP2024001',
        projectNo: 'LMT2024001',
        projectName: 'Office Building Lighting Design',
        team: 'John Smith (TL)',
        date: '2024-01-15',
        directorInCharge: 'Jane Doe (DI)',
        discipline: 'Lighting',
        location: 'Bangkok, Thailand',
        client: 'ABC Corporation',
        contactName: 'Mr. John Client',
        mtlScope:
          'Complete lighting design including energy analysis, fixture selection, and control systems',
        comments: 'High-end commercial building with LED lighting system.',

        feeAgreementOriginal: true,
        feeAgreementRev1: false,
        feeAgreementRev2: false,
        feeAgreementRev3: false,

        grossFeeOriginal: 1200000,
        grossFeeRev1: 0,
        grossFeeRev2: 0,
        grossFeeRev3: 0,

        subconsultantsAmountOriginal: 150000,
        subconsultantsNameOriginal: 'Electrical Engineer',
        subconsultantsAmountRev1: 0,
        subconsultantsAmountRev2: 0,
        subconsultantsAmountRev3: 0,

        otherExpensesOriginal: 50000,
        otherExpensesRev1: 0,
        otherExpensesRev2: 0,
        otherExpensesRev3: 0,

        nettFeeOriginal: 1000000,
        nettFeeRev1: 0,
        nettFeeRev2: 0,
        nettFeeRev3: 0,

        preliminaryPercentage: 40,
        preliminaryStartDate: '2024-01-15',
        preliminaryEndDate: '2024-02-15',

        detailedDesignPercentage: 15,
        detailedDesignStartDate: '2024-02-16',
        detailedDesignEndDate: '2024-03-15',

        tenderPercentage: 30,
        tenderStartDate: '2024-03-16',
        tenderEndDate: '2024-04-15',

        constructionPercentage: 15,
        constructionStartDate: '2024-04-16',
        constructionEndDate: '2024-05-15',

        billingForecast: [
          { month: 'Jan 2024', amount: 400000 },
          { month: 'Feb 2024', amount: 300000 },
          { month: 'Mar 2024', amount: 300000 }
        ],

        filledInBy: 'Mr. John Client',
        filledInDate: '2024-01-15',
        approvedBy: 'Jane Doe (DI)',
        approvedDate: '2024-01-20',

        createdAt: '2024-01-10',
        updatedAt: '2024-01-25'
      };

      this.isLoading = false;
    }, 800);
  }

  getStatusLabel(status: string) {
    return {
      submitted: 'Submitted',
      approved: 'Approved',
      rejected: 'Rejected'
    }[status] || status;
  }

  getStatusBadgeClass(status: string) {
    return {
      submitted: 'bg-blue-100 text-blue-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700'
    }[status] || 'bg-gray-100 text-gray-700';
  }

  onBack(): void {
    this.router.navigate(['/project-lighting-fee-sheet/list']);
  }

  onEdit(): void {
    this.router.navigate(['/project-lighting-fee-sheet/edit', this.feeSheet.id]);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-GB');
  }

  formatCurrency(num: number | null | undefined): string {
    if (!num) return '฿0';
    return '฿' + num.toLocaleString('en-US');
  }

  /** รีเซ็ตการตัดสินใจ */
  onCancelDecision() {
    this.approvalDecision = '';
    this.approvalComments = '';
  }

  /** ส่งฟอร์ม Approve/Decline */
  onSubmitApproval() {
    if (!this.approvalDecision) {
      alert('Please choose Approve or Decline.');
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
      alert(
        `Decision: ${this.approvalDecision}\nComments: ${this.approvalComments}`
      );
    });
  }
}
