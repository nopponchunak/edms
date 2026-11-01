import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubConsultantAssessment } from '../sub-consultant-assessment-view/sub-consultant-assessment-view.component';

@Component({
  selector: 'app-sub-consultant-assessment-print',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sub-consultant-assessment-print.component.html',
  styleUrls: ['./sub-consultant-assessment-print.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class SubConsultantAssessmentPrintComponent implements OnInit {
  @Input() assessment: SubConsultantAssessment | null = null;

  ngOnInit(): void {
    // Trigger print when component is loaded
    setTimeout(() => {
      window.print();
    }, 100);
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  getReferenceLabel(index: number): string {
    return String.fromCharCode(97 + index);
  }

  getOpinionText(opinion: string): string {
    switch (opinion) {
      case 'good':
        return 'positive';
      case 'neutral':
        return 'neutral';
      case 'poor':
        return 'negative';
      default:
        return opinion;
    }
  }

  hasISO14001(): boolean {
    return this.assessment?.ems_iso_14001 === 1;
  }

  hasISO45001(): boolean {
    return this.assessment?.ems_iso_45001 === 1;
  }

  hasOHSAS18001(): boolean {
    return this.assessment?.ems_ohsas_18001 === 1;
  }

  hasCompliance(): boolean {
    return this.hasISO14001() || this.hasISO45001() || this.hasOHSAS18001();
  }

  isApprovedToSubConsultantList(): boolean {
    return this.getSubConsultantListDecision() === true;
  }

  isNotApprovedToSubConsultantList(): boolean {
    return this.getSubConsultantListDecision() === false;
  }

  private getSubConsultantListDecision(): boolean | null {
    const decision = this.assessment?.decision_sub_consultant_list;
    if (decision !== null && decision !== undefined && decision !== '') {
      const normalized = String(decision).toLowerCase();
      if (decision === true || decision === 1 || normalized === '1' || normalized === 'true' || normalized === 'yes') {
        return true;
      }
      if (decision === false || decision === 0 || normalized === '0' || normalized === 'false' || normalized === 'no') {
        return false;
      }
    }

    const approvedStatus = String(this.assessment?.approved_by_status || '').toLowerCase();
    if (approvedStatus === 'approved' || approvedStatus === 'approve') {
      return true;
    }
    if (approvedStatus === 'rejected' || approvedStatus === 'reject') {
      return false;
    }

    return null;
  }

  getRecommendationText(): string {
    if (this.assessment?.recommendation === 'accept') {
      return 'Accept';
    }
    return 'Not accept';
  }
}
