import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { formatDateDisplay } from 'app/core/utils/date-format.util';

export interface TenderPrintChecklistItem {
  id: string;
  question: string;
  type?: string;
  required?: boolean;
}

@Component({
  selector: 'app-tender-print-document',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tender-print-document.component.html',
  styleUrls: ['./tender-print-document.component.scss'],
})
export class TenderPrintDocumentComponent {
  @Input({ required: true }) form!: FormGroup;
  @Input() recordData: any = null;
  @Input() checklist: TenderPrintChecklistItem[] = [];
  @Input() documentTypes: string[] = [];
  @Input() printRootClass = 'tender-print-root';
  @Input() includeReviewerForActionInPrint = true;
  @Input() employeeDisplay: (value: unknown) => string = (value) => String(value ?? '').trim();

  readonly footerPrimary =
    'M:/MTL_INDEX/IMS DOCUMENTATION/5. FORMS/20 - MTDD-04 DETAILED DESIGN_TENDER REVIEW_VERIFICATION - CHECKLIST.DOCX/TWJ/SA/MA/MJR/ANS';
  readonly footerEffective = 'EFFECTIVE DATE: 20 MAY 2024';
  readonly footerSource =
    'SOURCE: I/ITC MANAGEMENT SYSTEMS/DOCUMENTS/DESIGN REVIEW ONLINE/FORMS/20 - MTDD-04 DETAILED DESIGN_TENDER REVIEW_VERIFICATION - CHECKLIST.docx';

  get projectName(): string {
    return this.getControlValue('projectName');
  }

  get projectNumber(): string {
    return this.getControlValue('projectNumber');
  }

  get preparedBy(): string {
    return this.getEmployeeValue('preparedBy', 'preparedBy', 'prepared_by');
  }

  get disciplineLine(): string {
    const discipline =
      this.getControlValue('discipline') === 'Other'
        ? this.getControlValue('disciplineOther')
        : this.getControlValue('discipline');
    const detail = this.getControlValue('stage');

    return [discipline, detail].filter(Boolean).join(' - ');
  }

  get comments(): string {
    return this.getControlValue('comments');
  }

  get recommendedActions(): string {
    return this.getControlValue('recommendedActions');
  }

  get note(): string {
    return this.getControlValue('note');
  }

  get reviewedBy(): string {
    const paths = [
      'reviewedBy',
      'reviewed_by',
      'reviewed_by_tl',
      'reviewed_by_t_l',
    ];

    if (this.includeReviewerForActionInPrint) {
      paths.push('reviewerForAction', 'reviewer_for_action');
    }

    return this.getEmployeeValue('reviewedBy', ...paths);
  }

  get reviewedByDate(): string {
    return this.getPrintDate('reviewedByDate', 'reviewed_by_date', 'reviewed_by_tl_date', 'reviewed_by_t_l_date');
  }

  get respondedBy(): string {
    return this.getEmployeeValue('respondedBy', 'respondedBy', 'responded_by', 'preparedBy', 'prepared_by');
  }

  get respondedByDate(): string {
    return this.getPrintDate('respondedByDate', 'responded_by_date');
  }

  get signedByVVE(): string {
    const paths = [
      'signedByVVE',
      'signed_by_vve',
      'signed_by_v_v_e',
      'reviewedBy',
      'reviewed_by',
    ];

    if (this.includeReviewerForActionInPrint) {
      paths.splice(3, 0, 'reviewerForAction', 'reviewer_for_action');
    }

    return this.getEmployeeValue('signedByVVE', ...paths);
  }

  get signedByVVEDate(): string {
    return this.getPrintDate('signedByVVEDate', 'signed_by_vve_date', 'signed_by_v_v_e_date');
  }

  get signedByTL(): string {
    return this.getEmployeeValue(
      'signedByTL',
      'signedByTL',
      'signed_by_tl',
      'signed_by_t_l',
      'teamLeadForAction',
      'team_lead_for_action'
    );
  }

  get signedByTLDate(): string {
    return this.getPrintDate('signedByTLDate', 'signed_by_tl_date', 'signed_by_t_l_date');
  }

  get acknowledgedBy(): string {
    return this.getEmployeeValue(
      'acknowledgedBy',
      'acknowledgedBy',
      'acknowledged_by',
      'acknowledged_by_d_i',
      'directorForAction',
      'director_for_action'
    );
  }

  get acknowledgedByDate(): string {
    return this.getPrintDate('acknowledgedByDate', 'acknowledged_by_date', 'acknowledged_by_d_i_date');
  }

  isDocumentChecked(documentType: string): boolean {
    return this.getSelectedDocumentTypes().includes(documentType);
  }

  isChecklistResponse(index: number, expected: 'yes' | 'no' | 'na'): boolean {
    return this.normalizeChecklistResponse(this.checklistResponsesArray?.at(index)?.value) === expected;
  }

  isRecommendedActionYes(): boolean {
    return this.isPrintBooleanYes(this.recommendedActionValue);
  }

  isRecommendedActionNo(): boolean {
    return this.isPrintBooleanNo(this.recommendedActionValue);
  }

  private get recommendedActionValue(): unknown {
    const sourceValue = this.pickValue(
      this.recordData ?? {},
      'recommendedActionsSatisfactorilyTaken',
      'recommended_actions_satisfactorily_taken'
    );

    if (sourceValue !== undefined) {
      return sourceValue;
    }

    return this.recordData ? undefined : this.form?.get('recommendedActionsSatisfactorilyTaken')?.value;
  }

  private get documentTypesArray(): FormArray | null {
    return (this.form?.get('documentTypes') as FormArray | null) ?? null;
  }

  private get checklistResponsesArray(): FormArray | null {
    return (this.form?.get('checklistResponses') as FormArray | null) ?? null;
  }

  private getSelectedDocumentTypes(): string[] {
    const formArray = this.documentTypesArray;

    if (!formArray) {
      return [];
    }

    return this.documentTypes.filter((_, index) => Boolean(formArray.at(index)?.value));
  }

  private getControlValue(controlName: string): string {
    const value = this.form?.get(controlName)?.value;
    return value === undefined || value === null ? '' : String(value).trim();
  }

  private getEmployeeValue(controlName: string, ...paths: string[]): string {
    const sourceValue = this.pickValue(this.recordData ?? {}, ...paths);
    const value =
      sourceValue !== undefined && sourceValue !== null && String(sourceValue).trim() !== ''
        ? sourceValue
        : this.form?.get(controlName)?.value;
    const display = this.employeeDisplay(value);

    return display === '-' ? '' : String(display ?? '').trim();
  }

  private getPrintDate(...paths: string[]): string {
    const date = this.pickDate(this.recordData ?? {}, ...paths);
    if (date) {
      return formatDateDisplay(date as string | Date);
    }

    if (this.recordData) {
      return '';
    }

    const fallbackDate = paths
      .map((path) => this.form?.get(path)?.value)
      .find((value) => value !== undefined && value !== null && String(value).trim() !== '');

    return fallbackDate ? formatDateDisplay(fallbackDate as string | Date) : '';
  }

  private pickValue(source: any, ...paths: string[]): unknown {
    if (!source) {
      return undefined;
    }

    for (const path of paths) {
      if (source[path] !== undefined && source[path] !== null && String(source[path]).trim() !== '') {
        return source[path];
      }
    }

    return undefined;
  }

  private pickDate(source: any, ...paths: string[]): unknown {
    return this.pickValue(source, ...paths);
  }

  private normalizeChecklistResponse(value: unknown): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'n/a' ? 'na' : normalized;
  }

  private isPrintBooleanYes(value: unknown): boolean {
    if (value === true) {
      return true;
    }

    return ['yes', 'true', '1', 'approved', 'approve', 'satisfied'].includes(
      String(value ?? '').trim().toLowerCase()
    );
  }

  private isPrintBooleanNo(value: unknown): boolean {
    if (value === false) {
      return true;
    }

    return ['no', 'false', '0', 'rejected', 'reject', 'unsatisfied'].includes(
      String(value ?? '').trim().toLowerCase()
    );
  }
}
