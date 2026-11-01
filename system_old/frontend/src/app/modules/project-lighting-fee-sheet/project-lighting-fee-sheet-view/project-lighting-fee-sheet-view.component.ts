import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { Router, ActivatedRoute } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// ✅ service กลาง
import { FeeSheetService } from 'app/core/services/fee-sheet.service';
// ✅ แก้ path ให้ตรงของพี่
import { EmployeeService } from 'app/core/services/employee.service';
import { ProjectTypeService } from 'app/core/services/project-type.service';

export interface ProjectLightingFeeSheet {
  id: string;
  copiesTo: string;
  circ: string;
  chFile: string;
  fee: string;
  projectPNo: string;
  projectNo: string;
  team: string;
  date: string;
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

  preliminaryPercentage: number;
  preliminaryStartDate: string;
  preliminaryEndDate: string;

  detailedDesignPercentage: number;
  detailedDesignStartDate: string;
  detailedDesignEndDate: string;

  tenderPercentage: number;
  tenderStartDate: string;
  tenderEndDate: string;

  constructionPercentage: number;
  constructionStartDate: string;
  constructionEndDate: string;

  billingForecast: Array<{ month: string; amount: number }>;
  projectType: string;

  filledInBy: string;
  filledInDate: string;
  approvedBy: string;
  approvedDate: string;

  status: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-lighting-fee-sheet-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    FuseAlertComponent,
  ],
  templateUrl: './project-lighting-fee-sheet-view.component.html',
  styleUrls: ['./project-lighting-fee-sheet-view.component.scss'],
})
export class ProjectLightingFeeSheetViewComponent implements OnInit {
  feeSheet: ProjectLightingFeeSheet | null = null;
  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  private employeeLabelById = new Map<number, string>();
  private employeeLabelByCode = new Map<string, string>();
  private projectTypeLabelById = new Map<number, string>();
  private readonly legacyEmployeeLabels = new Map<number, string>([
    [1, 'John Smith (TL)'],
    [2, 'Jane Doe (MD)'],
    [3, 'Mike Johnson (DI)'],
    [4, 'Alice Brown (TL)'],
    [5, 'Bob Green (DI)'],
  ]);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private feeApi: FeeSheetService,
    private employeeService: EmployeeService,
    private projectTypeService: ProjectTypeService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadFeeSheetAndEmployees(id);
  }

  private pickFeeAgreement(rows: any[], revNo: number): any | null {
    if (!Array.isArray(rows) || !rows.length) return null;
    const byRevNo = rows
      .filter((x: any) => Number(x?.revision_no ?? x?.rev_no) === revNo)
      .sort((a: any, b: any) => {
        const ta = new Date(a?.updated_at ?? a?.created_at ?? 0).getTime();
        const tb = new Date(b?.updated_at ?? b?.created_at ?? 0).getTime();
        if (ta !== tb) return ta - tb;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });
    if (byRevNo.length) return byRevNo[byRevNo.length - 1];
    return rows[revNo] ?? null;
  }

  private loadFeeSheetAndEmployees(id: string): void {
    this.isLoading = true;
    this.alert = null;

    forkJoin({
      fee: this.feeApi.getById(id),
      employees: this.employeeService.getEmployees('', 200).pipe(catchError(() => of([]))),
      projectTypes: this.projectTypeService.page({ page: 1, perPage: 300 }).pipe(catchError(() => of({ items: [] }))),
    }).subscribe({
      next: ({ fee, employees, projectTypes }: any) => {
        // 1) employee id -> label
        this.employeeLabelById.clear();
        this.employeeLabelByCode.clear();
        this.normalizeToArray(employees).forEach((e: any) => {
            const idNum = Number(e?.id);
            const code = String(e?.employee_code ?? e?.code ?? '').trim();
            if (!Number.isFinite(idNum)) return;

            const name = `${e?.firstname ?? ''} ${e?.lastname ?? ''}`.trim() || e?.name || `Employee ${idNum}`;
            const label = code ? `${name} (${code})` : name;

            this.employeeLabelById.set(idNum, label);
            if (code) this.employeeLabelByCode.set(code, label);
          });

        this.projectTypeLabelById.clear();
        this.normalizeToArray(projectTypes).forEach((t: any) => {
          const idNum = Number(t?.id);
          if (!Number.isFinite(idNum)) return;
          this.projectTypeLabelById.set(
            idNum,
            [t?.code, t?.name].filter(Boolean).join(' ').trim() || String(idNum)
          );
        });

        // 2) map api -> view
        const rev = fee?.revision ?? null; // current_revision
        const proj = fee?.project ?? null;

        // fee_agreements by revision_no
        const feeAgs = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements : [];
        const ag0 = this.pickFeeAgreement(feeAgs, 0);
        const ag1 = this.pickFeeAgreement(feeAgs, 1);
        const ag2 = this.pickFeeAgreement(feeAgs, 2);
        const ag3 = this.pickFeeAgreement(feeAgs, 3);

        // job_costings phase -> map (Lighting: P,D,T,C)
        const job = Array.isArray(rev?.job_costings)
          ? rev.job_costings
          : Array.isArray(rev?.job_costing)
            ? rev.job_costing
            : [];
        const byPhase = (p: string) => job.find((x: any) => String(x?.phase) === p) ?? null;

        const P = byPhase('P');
        const D = byPhase('D');
        const T = byPhase('T');
        const C = byPhase('C');

        const teamMembers = Array.isArray(rev?.team_members) ? rev.team_members : [];
        const teamText = teamMembers.length
          ? teamMembers.map((x: any) => this.getEmployeeLabel(x.employee_code)).filter(Boolean).join(', ')
          : '-';

        const directorId = rev?.director_in_charge_id;
        const filledId = rev?.form_filled_by_id;
        const approvedId = rev?.approved_by_ch_id;

        this.feeSheet = {
          id: String(fee?.id ?? id),

          copiesTo: proj?.copies_to ?? '-',
          circ: proj?.circ_adm ?? '-',
          chFile: proj?.ch_file ?? '-',
          fee: proj?.fee ?? '-',

          projectPNo: proj?.project_no ?? '-',
          projectNo: fee?.mtProjectNo ?? rev?.mt_project_no ?? '-',
          team: teamText,

          date: rev?.form_filled_by_date ?? rev?.created_at ?? '',
          directorInCharge: this.getEmployeeLabel(directorId),
          discipline: 'Lighting',

          projectName: rev?.project_name ?? proj?.project_name ?? '-',
          location: rev?.location ?? proj?.city ?? '-',
          client: rev?.client_name ?? proj?.client_name ?? '-',
          contactName: rev?.contact_name ?? proj?.client_contact_name ?? '-',
          mtlScope: rev?.mtl_scope_detail ?? '-',
          comments: rev?.comment ?? '-',

          feeAgreementOriginal: !!ag0,
          grossFeeOriginal: Number(ag0?.gross_fee_excl_vat ?? 0),
          subconsultantsNameOriginal: String(ag0?.less_subconsultants_name ?? ''),
          subconsultantsAmountOriginal: Number(ag0?.less_subconsultants_number ?? 0),
          otherExpensesOriginal: Number(ag0?.less_other_expenses ?? 0),
          nettFeeOriginal: Number(ag0?.net_fee_excl_vat ?? 0),

          feeAgreementRev1: !!ag1,
          grossFeeRev1: Number(ag1?.gross_fee_excl_vat ?? 0),
          subconsultantsNameRev1: String(ag1?.less_subconsultants_name ?? ''),
          subconsultantsAmountRev1: Number(ag1?.less_subconsultants_number ?? 0),
          otherExpensesRev1: Number(ag1?.less_other_expenses ?? 0),
          nettFeeRev1: Number(ag1?.net_fee_excl_vat ?? 0),

          feeAgreementRev2: !!ag2,
          grossFeeRev2: Number(ag2?.gross_fee_excl_vat ?? 0),
          subconsultantsNameRev2: String(ag2?.less_subconsultants_name ?? ''),
          subconsultantsAmountRev2: Number(ag2?.less_subconsultants_number ?? 0),
          otherExpensesRev2: Number(ag2?.less_other_expenses ?? 0),
          nettFeeRev2: Number(ag2?.net_fee_excl_vat ?? 0),

          feeAgreementRev3: !!ag3,
          grossFeeRev3: Number(ag3?.gross_fee_excl_vat ?? 0),
          subconsultantsNameRev3: String(ag3?.less_subconsultants_name ?? ''),
          subconsultantsAmountRev3: Number(ag3?.less_subconsultants_number ?? 0),
          otherExpensesRev3: Number(ag3?.less_other_expenses ?? 0),
          nettFeeRev3: Number(ag3?.net_fee_excl_vat ?? 0),

          // Job costing (P,D,T,C)
          preliminaryPercentage: Number(P?.percent ?? P?.percentage ?? 0),
          preliminaryStartDate: String(P?.start_date ?? ''),
          preliminaryEndDate: String(P?.end_date ?? ''),

          detailedDesignPercentage: Number(D?.percent ?? D?.percentage ?? 0),
          detailedDesignStartDate: String(D?.start_date ?? ''),
          detailedDesignEndDate: String(D?.end_date ?? ''),

          tenderPercentage: Number(T?.percent ?? T?.percentage ?? 0),
          tenderStartDate: String(T?.start_date ?? ''),
          tenderEndDate: String(T?.end_date ?? ''),

          constructionPercentage: Number(C?.percent ?? C?.percentage ?? 0),
          constructionStartDate: String(C?.start_date ?? ''),
          constructionEndDate: String(C?.end_date ?? ''),

          billingForecast: (() => {
            const billingRaw = Array.isArray(rev?.billing_forecasts)
              ? rev.billing_forecasts
              : Array.isArray(rev?.billing_forecast)
                ? rev.billing_forecast
                : [];
            const billingSorted = [...billingRaw].sort((a: any, b: any) => {
              const ta = new Date(a?.updated_at ?? a?.created_at ?? 0).getTime();
              const tb = new Date(b?.updated_at ?? b?.created_at ?? 0).getTime();
              if (ta !== tb) return ta - tb;
              return Number(a?.id ?? 0) - Number(b?.id ?? 0);
            });
            const byMonth = new Map<string, { month: string; amount: number }>();
            billingSorted.forEach((b: any, i: number) => {
              const month = String(b?.month ?? b?.estimated_date ?? '').trim();
              const key = month || `idx:${i}`;
              byMonth.set(key, { month, amount: Number(b?.amount ?? 0) });
            });
            return Array.from(byMonth.values());
          })(),

          projectType: rev?.project_type?.name ?? this.getProjectTypeLabel(Number(rev?.project_type_id)),

          filledInBy: this.getEmployeeLabel(filledId),
          filledInDate: rev?.form_filled_by_date ?? '',

          approvedBy: this.getEmployeeLabel(approvedId),
          approvedDate: rev?.approved_by_ch_date ?? '',

          status: rev?.status ?? 'draft',
          createdAt: rev?.created_at ?? '',
          updatedAt: rev?.updated_at ?? '',
        };

        this.isLoading = false;
      },
      error: (err: any) => {
        console.error(err);
        this.isLoading = false;
        this.alert = { type: 'error', message: err?.error?.message ?? 'Load fee sheet failed' };
      },
    });
  }

  private normalizeToArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.data?.items)) return raw.data.items;
    return [];
  }

  private getEmployeeLabel(ref: any): string {
    if (ref === null || ref === undefined) return '-';
    const text = String(ref).trim();
    if (!text) return '-';

    const id = Number(text);
    if (Number.isFinite(id) && id > 0) {
      return this.employeeLabelById.get(id) ?? this.legacyEmployeeLabels.get(id) ?? `ID: ${id}`;
    }

    return this.employeeLabelByCode.get(text) ?? text;
  }

  private getProjectTypeLabel(id: number): string {
    if (!Number.isFinite(id) || id <= 0) return '-';
    return this.projectTypeLabelById.get(id) ?? String(id);
  }

  onBack(): void {
    this.router.navigate(['/project-lighting-fee-sheet/list']);
  }

  onEdit(): void {
    if (this.feeSheet) {
      this.router.navigate(['/project-lighting-fee-sheet/edit', this.feeSheet.id]);
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
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
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(amount ?? 0));
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }
}
