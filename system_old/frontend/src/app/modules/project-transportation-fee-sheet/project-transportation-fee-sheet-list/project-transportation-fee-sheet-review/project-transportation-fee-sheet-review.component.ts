import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { FuseConfirmationService } from '@fuse/services/confirmation';

export interface ProjectTransportationFeeSheet {
  id: string;
  copiesTo: string;
  circ: string;
  chFile: string;
  fee: string;
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

  feeAgreementOriginal: boolean;
  grossFeeOriginal: number;
  subconsultantsNameOriginal: string;
  subconsultantsAmountOriginal: number;
  otherExpensesOriginal: number;
  nettFeeOriginal: number;

  feeAgreementRev1: boolean;
  grossFeeRev1: number;
  subconsultantsNameRev1: string;
  subconsultantsAmountRev1: number;
  otherExpensesRev1: number;
  nettFeeRev1: number;

  feeAgreementRev2: boolean;
  grossFeeRev2: number;
  subconsultantsNameRev2: string;
  subconsultantsAmountRev2: number;
  otherExpensesRev2: number;
  nettFeeRev2: number;

  feeAgreementRev3: boolean;
  grossFeeRev3: number;
  subconsultantsNameRev3: string;
  subconsultantsAmountRev3: number;
  otherExpensesRev3: number;
  nettFeeRev3: number;

  feeAgreementRev4: boolean;
  grossFeeRev4: number;
  subconsultantsNameRev4: string;
  subconsultantsAmountRev4: number;
  otherExpensesRev4: number;
  nettFeeRev4: number;

  preliminaryPercentage: number;
  preliminaryStartDate: string;
  preliminaryEndDate: string;

  conceptPercentage: number;
  conceptStartDate: string;
  conceptEndDate: string;

  schematicPercentage: number;
  schematicStartDate: string;
  schematicEndDate: string;

  detailedPercentage: number;
  detailedStartDate: string;
  detailedEndDate: string;

  tiaPercentage: number;
  tiaStartDate: string;
  tiaEndDate: string;

  billingForecast: Array<{
    deliverable: string;
    estimatedDate: string;
    amount: number;
  }>;
  billingForecastRevisions?: Array<{
    revisionNo: number;
    revisionLabel: string;
    items: Array<{
      deliverable: string;
      estimatedDate: string;
      amount: number;
    }>;
  }>;
  jobCostingAllocation?: Array<{
    phase: string;
    percentage: number;
    startDate: string;
    endDate: string;
  }>;
  jobCostingRevisions?: Array<{
    revisionNo: number;
    revisionLabel: string;
    items: Array<{
      phase: string;
      percentage: number;
      startDate: string;
      endDate: string;
    }>;
  }>;

  projectTypeA: boolean;
  projectTypeB: boolean;
  projectTypeC: boolean;
  projectTypeD: boolean;
  projectTypeE: boolean;
  projectTypeH: boolean;
  projectTypeI: boolean;
  projectTypeK: boolean;
  projectTypeL: boolean;
  projectTypeM: boolean;
  projectTypeQ: boolean;
  projectTypeR: boolean;
  projectTypeS: boolean;
  projectTypeT: boolean;
  projectTypeU: boolean;
  projectTypeV: boolean;

  filledInBy: string;
  filledInDate: string;
  approvedBy: string;
  approvedDate: string;

  status: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-transportation-fee-sheet-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    FormsModule,
     MatRadioModule,     // ⭐ ต้องเพิ่มบรรทัดนี้
    MatFormFieldModule,
     MatInputModule,
    MatCardModule,
    FuseAlertComponent,
  ],
  templateUrl: './project-transportation-fee-sheet-review.component.html',
  styleUrls: ['./project-transportation-fee-sheet-review.component.scss'],
})
export class ProjectTransportationFeeSheetViewComponent implements OnInit {
  feeSheet: ProjectTransportationFeeSheet | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  // ⭐ เพิ่มตัวแปร Review Section ⭐
   approvalDecision: 'approve' | 'decline' | null = null;
    approvalComments: string = '';

  leftProjectTypes = [
    { field: 'projectTypeA', label: 'A Commercial-Office' },
    { field: 'projectTypeB', label: 'B Commercial-General' },
    { field: 'projectTypeC', label: 'C Industrial' },
    { field: 'projectTypeD', label: 'D Institutional' },
    { field: 'projectTypeE', label: 'E Leisure/Recreation/Tourism' },
    { field: 'projectTypeH', label: 'H Infrastructure/Utilities' },
    { field: 'projectTypeI', label: 'I Residential' },
    { field: 'projectTypeK', label: 'K Miscellaneous' },
    { field: 'projectTypeL', label: 'L Geotechnical' },
  ];

  rightProjectTypes = [
    { field: 'projectTypeM', label: 'M Environmental' },
    { field: 'projectTypeQ', label: 'Q Aviation' },
    { field: 'projectTypeR', label: 'R Accredited Checking & Value Engineering' },
    { field: 'projectTypeS', label: 'S Healthcare' },
    { field: 'projectTypeT', label: 'T Fitout' },
    { field: 'projectTypeU', label: 'U Building Audit' },
    { field: 'projectTypeV', label: 'V PM/CM' },
  ];

  constructor(private router: Router, private route: ActivatedRoute,
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
        deliverable: b.deliverable,
        estimatedDate: b.estimatedDate ?? b.estimated_date ?? b.month ?? '',
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
    if (!feeSheet.jobCostingAllocation || !feeSheet.jobCostingAllocation.length) {
      const phases = [
        { key: 'preliminary', label: 'Preliminary' },
        { key: 'concept', label: 'Concept' },
        { key: 'schematic', label: 'Schematic' },
        { key: 'detailed', label: 'Detailed' },
        { key: 'tia', label: 'TIA' },
      ];
      feeSheet.jobCostingAllocation = phases.map(p => ({
        phase: p.label,
        percentage: Number(feeSheet[`${p.key}Percentage`] ?? 0),
        startDate: feeSheet[`${p.key}StartDate`] ?? '',
        endDate: feeSheet[`${p.key}EndDate`] ?? '',
      }));
    }

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

  loadFeeSheet(explicitId?: string | null): void {
    this.isLoading = true;
    const id = explicitId || this.route.snapshot.paramMap.get('id');

    if (id) {
      // Mock Data Loader
      setTimeout(() => {
        const found = {
          id,
          copiesTo: 'Accts.',
          circ: 'ADM/',
          chFile: 'TMT',
          fee: 'Fee',
          projectPNo: 'TP2024001',
          projectNo: 'TMT2024001',
          date: '2024-01-15',
          team: 'John Smith (TL)',
          directorInCharge: 'Jane Doe (DI)',
          discipline: 'Transportation',
          projectName: 'Highway Transportation Design',
          location: 'Bangkok, Thailand',
          client: 'Highway Department',
          contactName: 'Mr. John Client',
          mtlScope:
            'Complete transportation design including traffic analysis, road design, and intersection planning',
          comments:
            'Major highway expansion project with multiple interchanges',

          feeAgreementOriginal: true,
          grossFeeOriginal: 2500000,
          subconsultantsNameOriginal: 'Traffic Engineer',
          subconsultantsAmountOriginal: 300000,
          otherExpensesOriginal: 100000,
          nettFeeOriginal: 2100000,

          feeAgreementRev1: false,
          grossFeeRev1: 0,
          subconsultantsNameRev1: '',
          subconsultantsAmountRev1: 0,
          otherExpensesRev1: 0,
          nettFeeRev1: 0,

          feeAgreementRev2: false,
          grossFeeRev2: 0,
          subconsultantsNameRev2: '',
          subconsultantsAmountRev2: 0,
          otherExpensesRev2: 0,
          nettFeeRev2: 0,

          feeAgreementRev3: false,
          grossFeeRev3: 0,
          subconsultantsNameRev3: '',
          subconsultantsAmountRev3: 0,
          otherExpensesRev3: 0,
          nettFeeRev3: 0,

          feeAgreementRev4: false,
          grossFeeRev4: 0,
          subconsultantsNameRev4: '',
          subconsultantsAmountRev4: 0,
          otherExpensesRev4: 0,
          nettFeeRev4: 0,

          preliminaryPercentage: 20,
          preliminaryStartDate: '2024-01-15',
          preliminaryEndDate: '2024-02-15',

          conceptPercentage: 30,
          conceptStartDate: '2024-02-16',
          conceptEndDate: '2024-03-15',

          schematicPercentage: 20,
          schematicStartDate: '2024-03-16',
          schematicEndDate: '2024-04-15',

          detailedPercentage: 10,
          detailedStartDate: '2024-04-16',
          detailedEndDate: '2024-05-15',

          tiaPercentage: 20,
          tiaStartDate: '2024-05-16',
          tiaEndDate: '2024-06-15',

          billingForecast: [
            { deliverable: 'On Commissioning 10%', estimatedDate: '2024-01-15', amount: 250000 },
            { deliverable: 'Preliminary Report', estimatedDate: '2024-02-15', amount: 500000 },
            { deliverable: 'Concept Report', estimatedDate: '2024-03-15', amount: 750000 },
            { deliverable: 'Schematic Report', estimatedDate: '2024-04-15', amount: 500000 },
            { deliverable: 'Detailed Report', estimatedDate: '2024-05-15', amount: 250000 },
            { deliverable: 'Traffic Impact Assessment', estimatedDate: '2024-06-15', amount: 500000 },
          ],

          billingForecastRevisions: [
            {
              revisionNo: 0,
              revisionLabel: 'Original',
              items: [
                { deliverable: 'On Commissioning 10%', estimatedDate: '2024-01-15', amount: 250000 },
                { deliverable: 'Preliminary Report', estimatedDate: '2024-02-15', amount: 500000 },
                { deliverable: 'Concept Report', estimatedDate: '2024-03-15', amount: 750000 },
                { deliverable: 'Schematic Report', estimatedDate: '2024-04-15', amount: 500000 },
                { deliverable: 'Detailed Report', estimatedDate: '2024-05-15', amount: 250000 },
                { deliverable: 'Traffic Impact Assessment', estimatedDate: '2024-06-15', amount: 500000 },
              ]
            }
          ],

          projectTypeA: false,
          projectTypeB: false,
          projectTypeC: false,
          projectTypeD: false,
          projectTypeE: false,
          projectTypeH: true,
          projectTypeI: false,
          projectTypeK: false,
          projectTypeL: false,
          projectTypeM: false,
          projectTypeQ: false,
          projectTypeR: false,
          projectTypeS: false,
          projectTypeT: false,
          projectTypeU: false,
          projectTypeV: false,

          filledInBy: 'John Smith (TL)',
          filledInDate: '2024-01-15',

          approvedBy: 'Jane Doe (MD)',
          approvedDate: '2024-01-16',

          status: 'approved',

          createdAt: '2024-01-15',
          updatedAt: '2024-01-16',
        };

        this.feeSheet = JSON.parse(JSON.stringify(found));
        if (this.feeSheet) {
          if (!this.feeSheet.billingForecastRevisions || !this.feeSheet.billingForecastRevisions.length) {
            this.mapBillingForecastRevisions(this.feeSheet);
          }
          if (!this.feeSheet.jobCostingRevisions || !this.feeSheet.jobCostingRevisions.length) {
            this.mapJobCostingRevisions(this.feeSheet);
          }
        }

        this.isLoading = false;
      }, 800);
    } else {
      this.isLoading = false;
    }
  }

  // ⭐ ปุ่ม Back
  onBack(): void {
    this.router.navigate(['/project-transportation-fee-sheet/list']);
  }

  // ⭐ ปุ่ม Edit
  onEdit(): void {
    if (this.feeSheet) {
      this.router.navigate(['/project-transportation-fee-sheet/edit', this.feeSheet.id]);
    }
  }

  // ⭐ ส่งผลการ Review
  onCancelDecision(): void {
    this.approvalDecision = null;
    this.approvalComments = '';
  }

  onSubmitApproval(): void {
    if (!this.approvalDecision) {
      alert("Please select Approve or Decline.");
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
      // TODO: ยิง API ตรงนี้
    });
  }

  // ⭐ ปุ่ม Cancel Review
  onCancelReview(): void {
    this.router.navigate(['/project-transportation-fee-sheet/list']);
  }

  // Status Badge CSS
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'submitted': return 'Submitted';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }
}
