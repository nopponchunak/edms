import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';

type FeeStatus =
  | 'draft'
  | 'submitted'
  | 'proposal_reviewed'
  | 'contract_reviewed'
  | 'approved'
  | 'declined';

interface JobCostingAllocation {
  phase: string;
  percentage: number;
  startDate: string;
  endDate: string;
}

interface BillingForecast {
  month: string;
  amount: number;
}

export interface ProjectFacadeFeeSheetReview {
  id: string;

  // header
  copiesTo: string;
  circ: string;
  chFile: string;
  fee: string;

  // project info
  projectPNo: string;
  projectNo: string;
  date: string;
  team: string;
  directorInCharge: string;
  discipline: string;
  projectName: string;
  location: string;
  client: string;
  contactName: string;
  mtlScope: string;
  comments: string;

  status: FeeStatus;
  projectType: string;

  // fee table
  grossFeeOriginal: number;
  grossFeeRev1: number;
  grossFeeRev2: number;
  grossFeeRev3: number;
  grossFeeRev4: number;

  subconsultantsNameOriginal: string;
  subconsultantsAmountOriginal: number;
  subconsultantsNameRev1: string;
  subconsultantsAmountRev1: number;
  subconsultantsNameRev2: string;
  subconsultantsAmountRev2: number;
  subconsultantsNameRev3: string;
  subconsultantsAmountRev3: number;
  subconsultantsNameRev4: string;
  subconsultantsAmountRev4: number;

  otherExpensesOriginal: number;
  otherExpensesRev1: number;
  otherExpensesRev2: number;
  otherExpensesRev3: number;
  otherExpensesRev4: number;

  nettFeeOriginal: number;
  nettFeeRev1: number;
  nettFeeRev2: number;
  nettFeeRev3: number;
  nettFeeRev4: number;

  jobCostingAllocation: JobCostingAllocation[];
  jobCostingRevisions?: Array<{ revisionNo: number; revisionLabel: string; items: JobCostingAllocation[] }>;
  billingForecast: BillingForecast[];
  billingForecastRevisions?: Array<{ revisionNo: number; revisionLabel: string; items: BillingForecast[] }>;

  filledInBy: string;
  filledInDate: string;
  approvedBy: string;
  approvedDate: string;
  createdAt: string;
  updatedAt: string;
}

/** MOCK DATA (ใช้ให้หน้า UI ทำงานครบก่อน – เดี๋ยวค่อยเปลี่ยนเป็น API ได้)
 *  id = '1'
 *  id = '2' → Shopping Mall Façade Renovation (ที่พี่วงไว้)
 */
const MOCK_FACADE_FEE_SHEETS: ProjectFacadeFeeSheetReview[] = [
  {
    id: '1',
    copiesTo: 'TL, DI, CH',
    circ: 'Internal',
    chFile: 'CH-001',
    fee: 'Fee Proposal',

    projectPNo: 'FP2024001',
    projectNo: 'MFT2024001',
    date: '2024-01-10',
    team: 'John Smith (TL)',
    directorInCharge: 'Jane Doe (DI)',
    discipline: 'Facade',
    projectName: 'Office Building Façade Design',
    location: 'Bangkok, Thailand',
    client: 'ABC Corporation',
    contactName: 'Mr. Client Name',
    mtlScope: 'Façade concept, schematic and detailed design',
    comments: 'Mock data for office building façade project.',

    status: 'approved',
    projectType: 'Commercial-Office',

    grossFeeOriginal: 1_800_000,
    grossFeeRev1: 1_850_000,
    grossFeeRev2: 1_900_000,
    grossFeeRev3: 1_900_000,
    grossFeeRev4: 1_900_000,

    subconsultantsNameOriginal: 'Subconsultant A',
    subconsultantsAmountOriginal: 300_000,
    subconsultantsNameRev1: 'Subconsultant A',
    subconsultantsAmountRev1: 320_000,
    subconsultantsNameRev2: 'Subconsultant A',
    subconsultantsAmountRev2: 320_000,
    subconsultantsNameRev3: 'Subconsultant A',
    subconsultantsAmountRev3: 320_000,
    subconsultantsNameRev4: 'Subconsultant A',
    subconsultantsAmountRev4: 320_000,

    otherExpensesOriginal: 50_000,
    otherExpensesRev1: 60_000,
    otherExpensesRev2: 60_000,
    otherExpensesRev3: 60_000,
    otherExpensesRev4: 60_000,

    nettFeeOriginal: 1_450_000,
    nettFeeRev1: 1_470_000,
    nettFeeRev2: 1_480_000,
    nettFeeRev3: 1_480_000,
    nettFeeRev4: 1_480_000,

    jobCostingAllocation: [
      { phase: 'P', percentage: 40, startDate: '2024-01-15', endDate: '2024-02-15' },
      { phase: 'D', percentage: 15, startDate: '2024-02-16', endDate: '2024-03-15' },
      { phase: 'T', percentage: 30, startDate: '2024-03-16', endDate: '2024-05-15' },
      { phase: 'C', percentage: 15, startDate: '2024-05-16', endDate: '2024-07-15' }
    ],

    billingForecast: [
      { month: '01 Jan 2024', amount: 300_000 },
      { month: '01 Feb 2024', amount: 400_000 },
      { month: '01 Mar 2024', amount: 350_000 },
      { month: '01 Apr 2024', amount: 350_000 },
      { month: '01 May 2024', amount: 250_000 }
    ],
    billingForecastRevisions: [
      {
        revisionNo: 0,
        revisionLabel: 'Original',
        items: [
          { month: '01 Jan 2024', amount: 300_000 },
          { month: '01 Feb 2024', amount: 400_000 },
          { month: '01 Mar 2024', amount: 350_000 },
          { month: '01 Apr 2024', amount: 350_000 },
          { month: '01 May 2024', amount: 250_000 }
        ]
      }
    ],

    filledInBy: 'John Smith (TL)',
    filledInDate: '2024-01-10',
    approvedBy: 'Jane Doe (MD)',
    approvedDate: '2024-01-15',
    createdAt: '2024-01-10',
    updatedAt: '2024-01-15'
  },
  {
    id: '2',
    copiesTo: 'TL, DI, CH',
    circ: 'Internal',
    chFile: 'CH-002',
    fee: 'Fee Proposal',

    projectPNo: 'FP2024002',
    projectNo: 'MFT2024002',
    date: '2024-01-18',
    team: 'Alice Brown (TL)',
    directorInCharge: 'Bob Green (DI)',
    discipline: 'Facade',
    projectName: 'Shopping Mall Façade Renovation',
    location: 'Bangkok, Thailand',
    client: 'Mall Group Ltd.',
    contactName: 'Ms. Client Name',
    mtlScope: 'Façade renovation design and documentation',
    comments: 'Mock data for shopping mall façade renovation.',

    status: 'submitted',
    projectType: 'Commercial-General',

    grossFeeOriginal: 2_200_000,
    grossFeeRev1: 2_200_000,
    grossFeeRev2: 2_200_000,
    grossFeeRev3: 2_200_000,
    grossFeeRev4: 2_200_000,

    subconsultantsNameOriginal: 'Subconsultant B',
    subconsultantsAmountOriginal: 400_000,
    subconsultantsNameRev1: 'Subconsultant B',
    subconsultantsAmountRev1: 400_000,
    subconsultantsNameRev2: 'Subconsultant B',
    subconsultantsAmountRev2: 400_000,
    subconsultantsNameRev3: 'Subconsultant B',
    subconsultantsAmountRev3: 400_000,
    subconsultantsNameRev4: 'Subconsultant B',
    subconsultantsAmountRev4: 400_000,

    otherExpensesOriginal: 80_000,
    otherExpensesRev1: 80_000,
    otherExpensesRev2: 80_000,
    otherExpensesRev3: 80_000,
    otherExpensesRev4: 80_000,

    nettFeeOriginal: 1_720_000,
    nettFeeRev1: 1_720_000,
    nettFeeRev2: 1_720_000,
    nettFeeRev3: 1_720_000,
    nettFeeRev4: 1_720_000,

    jobCostingAllocation: [
      { phase: 'P', percentage: 35, startDate: '2024-01-20', endDate: '2024-02-20' },
      { phase: 'D', percentage: 20, startDate: '2024-02-21', endDate: '2024-03-20' },
      { phase: 'T', percentage: 30, startDate: '2024-03-21', endDate: '2024-05-20' },
      { phase: 'C', percentage: 15, startDate: '2024-05-21', endDate: '2024-07-20' }
    ],

    billingForecast: [
      { month: '01 Feb 2024', amount: 500_000 },
      { month: '01 Mar 2024', amount: 500_000 },
      { month: '01 Apr 2024', amount: 500_000 },
      { month: '01 May 2024', amount: 500_000 },
      { month: '01 Jun 2024', amount: 200_000 }
    ],
    billingForecastRevisions: [
      {
        revisionNo: 0,
        revisionLabel: 'Original',
        items: [
          { month: '01 Feb 2024', amount: 500_000 },
          { month: '01 Mar 2024', amount: 500_000 },
          { month: '01 Apr 2024', amount: 500_000 },
          { month: '01 May 2024', amount: 500_000 },
          { month: '01 Jun 2024', amount: 200_000 }
        ]
      }
    ],

    filledInBy: 'Alice Brown (TL)',
    filledInDate: '2024-01-18',
    approvedBy: 'Bob Green (MD)',
    approvedDate: '2024-01-20',
    createdAt: '2024-01-18',
    updatedAt: '2024-01-20'
  }
];

@Component({
  selector: 'app-project-facade-fee-sheet-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatDividerModule,
    MatRadioModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    FuseAlertComponent
  ],
  templateUrl: './project-facade-fee-sheet-review.component.html'
})
export class ProjectFacadeFeeSheetReviewComponent implements OnInit {
  alert: { type: FuseAlertType; message: string } | null = null;
  isLoading = false;
  feeSheet: ProjectFacadeFeeSheetReview | null = null;

  // สำหรับส่วน Approval Decision ด้านล่าง
  approvalDecision: 'approve' | 'decline' | null = null;
  approvalComments = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') || '0';

    const fromState = history.state?.item as any;
    if (fromState && fromState.id === id) {
      this.feeSheet = fromState;
      if (this.feeSheet) {
        if (!this.feeSheet.billingForecastRevisions || !this.feeSheet.billingForecastRevisions.length) {
          this.mapBillingForecastRevisions(this.feeSheet);
        }
        if (!this.feeSheet.jobCostingRevisions || !this.feeSheet.jobCostingRevisions.length) {
          this.mapJobCostingRevisions(this.feeSheet);
        }
      }
      this.isLoading = false;
      return;
    }

    this.loadFeeSheet(id);
  }

  private mapBillingForecastRevisions(feeSheet: any): void {
    const bfRaw = feeSheet.billingForecast || [];
    const groupedBf = new Map<number, { label: string; items: any[] }>();
    bfRaw.forEach((b: any) => {
      const rNo = Number(b?.revision_no ?? 0);
      if (!groupedBf.has(rNo)) {
        groupedBf.set(rNo, {
          label: b?.revision_label ?? (rNo === 0 ? 'Original' : `Rev ${rNo}`),
          items: []
        });
      }
      groupedBf.get(rNo)!.items.push({
        month: b.month,
        amount: Number(b.amount ?? 0)
      });
    });
    feeSheet.billingForecastRevisions = [...groupedBf.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rNo, group]) => ({
        revisionNo: rNo,
        revisionLabel: group.label,
        items: group.items
      }));
  }

  private mapJobCostingRevisions(feeSheet: any): void {
    const jcRaw = feeSheet.jobCostingAllocation || [];
    const groupedJc = new Map<number, { label: string; items: any[] }>();
    jcRaw.forEach((j: any) => {
      const rNo = Number(j?.revision_no ?? 0);
      if (!groupedJc.has(rNo)) {
        groupedJc.set(rNo, {
          label: j?.revision_label ?? (rNo === 0 ? 'Original' : `Rev ${rNo}`),
          items: []
        });
      }
      groupedJc.get(rNo)!.items.push({
        phase: j.phase,
        percentage: Number(j.percent ?? j.percentage ?? 0),
        startDate: j.startDate ?? j.start_date ?? '',
        endDate: j.endDate ?? j.end_date ?? ''
      });
    });
    feeSheet.jobCostingRevisions = [...groupedJc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rNo, group]) => ({
        revisionNo: rNo,
        revisionLabel: group.label,
        items: group.items
      }));
  }

  // โหลดข้อมูลตาม id จาก URL (ตอนนี้ใช้ MOCK – เดี๋ยวค่อยต่อ API ได้)
  loadFeeSheet(id: string | null): void {
    this.isLoading = true;

    setTimeout(() => {
      if (!id) {
        this.feeSheet = null;
        this.isLoading = false;
        return;
      }

      const found = MOCK_FACADE_FEE_SHEETS.find(x => x.id === id);

      if (!found) {
        this.feeSheet = null;
        this.alert = {
          type: 'warning',
          message: 'Façade fee sheet not found.'
        };
      } else {
        this.feeSheet = JSON.parse(JSON.stringify(found));
        if (this.feeSheet) {
          if (!this.feeSheet.billingForecastRevisions || !this.feeSheet.billingForecastRevisions.length) {
            this.mapBillingForecastRevisions(this.feeSheet);
          }
          if (!this.feeSheet.jobCostingRevisions || !this.feeSheet.jobCostingRevisions.length) {
            this.mapJobCostingRevisions(this.feeSheet);
          }
        }
      }

      this.isLoading = false;
    }, 400);
  }

  onBack(): void {
    this.router.navigate(['/project-facade-fee-sheet/list']);
  }

  // ถ้าพี่อยากให้มีปุ่ม Edit ทีหลัง ใช้อันนี้ได้
  onEdit(): void {
    if (this.feeSheet) {
      this.router.navigate(['/project-facade-fee-sheet/edit', this.feeSheet.id]);
    }
  }

  // กด Approve / Decline Review
  onApprove(): void {
    if (!this.feeSheet || !this.approvalDecision) {
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
      const isApprove = this.approvalDecision === 'approve';

      this.alert = {
        type: isApprove ? 'success' : 'error',
        message: isApprove
          ? 'Review approved successfully.'
          : 'Review has been declined.'
      };
    });

    // ตรงนี้พี่สามารถเอาไป call API ได้ทีหลัง
    // เช่นส่ง approvalDecision + approvalComments ไป backend

  }

  getStatusBadgeClass(status: FeeStatus): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'proposal_reviewed':
        return 'bg-orange-100 text-orange-800';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'declined':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusLabel(status: FeeStatus): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'proposal_reviewed':
        return 'Proposal Reviewed';
      case 'contract_reviewed':
        return 'Contract Reviewed';
      case 'approved':
        return 'Approved';
      case 'declined':
        return 'Declined';
      default:
        return status;
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }
}
