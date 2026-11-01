import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { CarService } from 'app/core/services/car.service';
import { Car, CarStatus, CarSeverity, CarSource, NonConformityType } from 'app/core/models/car.model';
import { formatDateDisplay, formatDateTimeNoSecondsDisplay } from 'app/core/utils/date-format.util';
import { ApprovalWorkflowComponent, ApprovalWorkflowStep } from 'app/core/components/approval-workflow';
import { EmployeeService } from 'app/core/services/employee.service';
import { Subject, takeUntil, forkJoin, map, of, switchMap } from 'rxjs';
import { ViewActionsComponent } from 'app/core/components/view-actions';

@Component({
    selector: 'app-car-view',
    standalone: true,
    imports: [
        CommonModule,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatDividerModule,
        FuseAlertComponent,
        ApprovalWorkflowComponent,
        ViewActionsComponent
    ],
    templateUrl: './car-view.component.html',
    styleUrls: ['./car-view.component.scss']
})
export class CarViewComponent implements OnInit, OnDestroy {
    private _unsubscribeAll: Subject<any> = new Subject<any>();
    readonly sourceOptions: Array<{ value: CarSource; label: string }> = [
        { value: CarSource.INTERNAL_IMS_AUDIT, label: 'Internal IMS Audit' },
        { value: CarSource.EXTERNAL_IMS_AUDIT, label: 'External IMS Audit' },
        { value: CarSource.MANAGEMENT_REVIEW, label: 'Management Review' },
        { value: CarSource.NON_CONFORMITY, label: 'Non-Conformity' },
        { value: CarSource.CLIENT_EXTERNAL_COMPLAINT, label: 'Client\'s or External Complaint' },
        { value: CarSource.INCIDENT_REPORTING_INVESTIGATION, label: 'Incident Reporting & Investigation' },
        { value: CarSource.OTHERS, label: 'Others' }
    ];

    readonly nonConformityTypeOptions: Array<{ value: NonConformityType; label: string }> = [
        { value: NonConformityType.NOT_CONFORM_CLIENT_REQUIREMENTS, label: 'Not conform to client\'s requirements' },
        { value: NonConformityType.VE_REQUESTED_MTL_DESIGN, label: 'VE has been requested on MTL\'s Design' },
        { value: NonConformityType.ERROR_IN_DESIGN, label: 'Error in design' },
        { value: NonConformityType.NOT_COMPLY_LAW_REGULATIONS, label: 'Not comply with law and related regulations' },
        { value: NonConformityType.ENVIRONMENTAL_ISSUE, label: 'Environmental issue' },
        { value: NonConformityType.HEALTH_SAFETY_ISSUE, label: 'Health & Safety issue' },
        { value: NonConformityType.NOT_FOLLOW_PROCEDURES, label: 'Not follow the Procedures' },
        { value: NonConformityType.OBJECTIVES_NOT_MET, label: 'Objectives not met' },
        { value: NonConformityType.OTHER_ISSUES, label: 'Other issues' }
    ];

    car: Car | null = null;
    loading = false;
    showAlert = false;
    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: ''
    };
    employeeLookup = new Map<string, string>();
    employeeLookupWithTitle = new Map<string, string>();

    constructor(
        private route: ActivatedRoute,
        public router: Router,
        private carService: CarService,
        private employeeService: EmployeeService
    ) {}

    ngOnInit(): void {
        this.loadCar();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    loadCar(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            this.router.navigate(['/cars']);
            return;
        }

        this.loading = true;
        forkJoin({
            car: this.carService.findOne(id),
            employeeLookup: this.employeeService.getEmployeeLookupMap(),
            employeeLookupWithTitle: this.employeeService.getEmployeeLookupMapWithTitle()
        }).pipe(
            switchMap(({ car, employeeLookup, employeeLookupWithTitle }) => {
                const codes = [
                    car.carIssuedBy,
                    car.to,
                    car.completedBy,
                    car.acknowledgedBy,
                    car.verifiedBy,
                    car.approvedBy,
                    (car as any).verifiedBy2,
                    (car as any).approvedBy2,
                    (car as any).create_by,
                    (car as any).update_by,
                    car.issuerId,
                    car.responsiblePersonId,
                    car.imrId
                ].filter(code => !!code);
                return this.employeeService.ensureEmployeesInLookup(employeeLookup, codes).pipe(
                    switchMap(updatedLookup => {
                        return this.employeeService.ensureEmployeesInLookup(employeeLookupWithTitle, codes).pipe(
                            map(updatedLookupWithTitle => ({ car, employeeLookup: updatedLookup, employeeLookupWithTitle: updatedLookupWithTitle }))
                        );
                    })
                );
            }),
            takeUntil(this._unsubscribeAll)
        ).subscribe({
            next: ({ car, employeeLookup, employeeLookupWithTitle }) => {
                this.car = car;
                this.employeeLookup = employeeLookup;
                this.employeeLookupWithTitle = employeeLookupWithTitle;
                this.loading = false;
            },
            error: (error) => {
                this.loading = false;
                this.showAlert = true;
                this.alert = {
                    type: 'error',
                    message: 'Failed to load CAR details. Please try again.'
                };
            }
        });
    }

    getEmployeeLabel(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(ref, this.employeeLookup);
    }

    getSeverityLabel(severity: CarSeverity): string {
        return severity === CarSeverity.MAJOR ? 'MAJOR' : 'MINOR';
    }

    getSeverityColor(severity: CarSeverity): string {
        return severity === CarSeverity.MAJOR 
            ? 'bg-red-100 text-red-800' 
            : 'bg-yellow-100 text-yellow-800';
    }

    getStatusLabel(status: CarStatus): string {
        const statusLabels: { [key in CarStatus]: string } = {
            [CarStatus.DRAFT]: 'Draft',
            [CarStatus.ISSUED]: 'Issued',
            [CarStatus.DISPOSITION_COMPLETED]: 'Disposition Completed',
            [CarStatus.FOLLOW_UP_COMPLETED]: 'Follow-up Completed',
            [CarStatus.IMR_REVIEWED]: 'IMR Reviewed',
            [CarStatus.APPROVED]: 'Approved',
            [CarStatus.REJECTED]: 'Rejected',
            [CarStatus.FOLLOW_UP_CAR_ISSUED]: 'Follow-up CAR Issued'
        };
        return statusLabels[status] || status;
    }

    getStatusColor(status: CarStatus): string {
        const statusColors: { [key in CarStatus]: string } = {
            [CarStatus.DRAFT]: 'bg-gray-100 text-gray-800',
            [CarStatus.ISSUED]: 'bg-blue-100 text-blue-800',
            [CarStatus.DISPOSITION_COMPLETED]: 'bg-yellow-100 text-yellow-800',
            [CarStatus.FOLLOW_UP_COMPLETED]: 'bg-green-100 text-green-800',
            [CarStatus.IMR_REVIEWED]: 'bg-purple-100 text-purple-800',
            [CarStatus.APPROVED]: 'bg-green-100 text-green-800',
            [CarStatus.REJECTED]: 'bg-red-100 text-red-800',
            [CarStatus.FOLLOW_UP_CAR_ISSUED]: 'bg-orange-100 text-orange-800'
        };
        return statusColors[status] || 'bg-gray-100 text-gray-800';
    }

    getSourceLabel(source: CarSource | string): string {
        // If source is already a string (Thai text from API), return as is
        if (typeof source === 'string' && !Object.values(CarSource).includes(source as CarSource)) {
            return source;
        }
        
        // Otherwise, map enum to label
        const sourceLabels: { [key in CarSource]: string } = {
            [CarSource.INTERNAL_IMS_AUDIT]: 'Internal IMS Audit',
            [CarSource.EXTERNAL_IMS_AUDIT]: 'External IMS Audit',
            [CarSource.MANAGEMENT_REVIEW]: 'Management Review',
            [CarSource.NON_CONFORMITY]: 'Non-Conformity',
            [CarSource.CLIENT_EXTERNAL_COMPLAINT]: 'Client\'s or External Complaint',
            [CarSource.INCIDENT_REPORTING_INVESTIGATION]: 'Incident Reporting & Investigation',
            [CarSource.OTHERS]: 'Others'
        };
        return sourceLabels[source as CarSource] || String(source);
    }

    getNonConformityTypeLabel(type: NonConformityType | string): string {
        // If type is already a string (Thai text from API), return as is
        if (typeof type === 'string' && !Object.values(NonConformityType).includes(type as NonConformityType)) {
            return type;
        }
        
        // Otherwise, map enum to label
        const typeLabels: { [key in NonConformityType]: string } = {
            [NonConformityType.NOT_CONFORM_CLIENT_REQUIREMENTS]: 'Not conform to client\'s requirements',
            [NonConformityType.VE_REQUESTED_MTL_DESIGN]: 'VE has been requested on MTL\'s Design',
            [NonConformityType.ERROR_IN_DESIGN]: 'Error in design',
            [NonConformityType.NOT_COMPLY_LAW_REGULATIONS]: 'Not comply with law and related regulations',
            [NonConformityType.ENVIRONMENTAL_ISSUE]: 'Environmental issue',
            [NonConformityType.HEALTH_SAFETY_ISSUE]: 'Health & Safety issue',
            [NonConformityType.NOT_FOLLOW_PROCEDURES]: 'Not follow the Procedures',
            [NonConformityType.OBJECTIVES_NOT_MET]: 'Objectives not met',
            [NonConformityType.OTHER_ISSUES]: 'Other issues'
        };
        return typeLabels[type as NonConformityType] || String(type);
    }

    formatDate(dateString: string | null | undefined): string {
        return formatDateDisplay(dateString);
    }

    formatDateTime(dateString: string | null | undefined): string {
        return formatDateTimeNoSecondsDisplay(dateString);
    }

    getEmployeeLabelWithTitle(ref: string | number | null | undefined): string {
        return this.employeeService.formatEmployeeReference(ref, this.employeeLookupWithTitle);
    }

    getFinalVerifiedDate(): string | null | undefined {
        return this.getStepDate(4);
    }

    getFinalVerifiedStatus(): string | null | undefined {
        return this.getStepStatus(4);
    }

    getFinalApprovedDate(): string | null | undefined {
        return this.getStepDate(5);
    }

    getFinalApprovedStatus(): string | null | undefined {
        return this.getStepStatus(5);
    }

    getStatusText(status: string | null | undefined): string {
        return this.getByStatusText(status);
    }

    getStatusBadgeClass(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            case 'approved':
            case 'approve':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'rejected':
            case 'reject':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    // Utility methods to safely get step data (handling both snake_case and camelCase)
    getStepStatus(step: number): string | null | undefined {
        if (!this.car) return null;
        const car = this.car as any;
        switch (step) {
            case 1: return car.approved_by_status ?? car.approvedByStatus;
            case 2: return car.completed_by_status ?? car.completedByStatus;
            case 3: return car.acknowledged_by_status ?? car.acknowledgedByStatus;
            case 4: return car.verified_by_status ?? car.verifiedByStatus;
            case 5: return car.approved_by_status_2 ?? car.approvedByStatus2 ?? car.approve_by_status_2;
            default: return null;
        }
    }

    getStepDate(step: number): string | null | undefined {
        if (!this.car) return null;
        const car = this.car as any;
        switch (step) {
            case 1: return car.approved_by_date ?? car.approvedByDate;
            case 2: return car.completed_by_date ?? car.completedByDate;
            case 3: return car.acknowledged_by_date ?? car.acknowledgedByDate;
            case 4: return car.verified_by_date ?? car.verifiedByDate;
            case 5: return car.approved_by_date_2 ?? car.approvedByDate2 ?? car.approve_by_date_2;
            default: return null;
        }
    }

    getStepPerson(step: number): string | null | undefined {
        if (!this.car) return null;
        const car = this.car as any;
        switch (step) {
            case 1: return car.approved_by ?? car.approvedBy;
            case 2: return car.completed_by ?? car.completedBy;
            case 3: return car.acknowledged_by ?? car.acknowledgedBy;
            case 4: return car.verified_by ?? car.verifiedBy;
            case 5: return car.approved_by ?? car.approvedBy;
            default: return null;
        }
    }

    getByStatusText(status: string | null | undefined): string {
        if (!status) return 'Pending';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending': return 'Pending';
            case 'approved':
            case 'approve': return 'Approved';
            case 'rejected':
            case 'reject': return 'Rejected';
            default: return status;
        }
    }

    getByStatusColor(status: string | null | undefined): string {
        if (!status) return 'bg-yellow-100 text-yellow-800';
        const statusLower = status.toLowerCase();
        switch (statusLower) {
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'approved':
            case 'approve': return 'bg-green-100 text-green-800';
            case 'rejected':
            case 'reject': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    public isPendingStatus(status: string | null | undefined): boolean {
        return !status || status.toLowerCase() === 'pending';
    }

    isSourceSelected(source: CarSource | string): boolean {
        return !!this.car?.sources?.includes(source as CarSource);
    }

    isNonConformityTypeSelected(type: NonConformityType | string): boolean {
        return !!this.car?.nonConformityTypes?.includes(type as NonConformityType);
    }

    canEdit(): boolean {
        return this.car?.status === CarStatus.DRAFT;
    }

    onPrint(): void {
        if (!this.car) {
            return;
        }

        const printWindow = window.open('', '_blank', 'width=1024,height=1448');
        if (!printWindow) {
            return;
        }

        const printMarkup = this.getPrintMarkup();
        printWindow.document.open();
        printWindow.document.write(printMarkup);
        printWindow.document.close();

        printWindow.onload = () => {
            window.setTimeout(() => {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            }, 250);
        };
    }

    editCar(): void {
        this.router.navigate(['/cars/edit', this.car?.id]);
    }

    private getPrintMarkup(): string {
        const car = this.car!;
        const logoUrl = `${window.location.origin}/images/logo/meinhardt-logo.svg`;
        const sourceSet = new Set((car.sources || []).map(value => String(value).trim()));
        const nonConformitySet = new Set((car.nonConformityTypes || []).map(value => String(value).trim()));
        const responseTimeText = this.toBoolean(car.responseTimeCheck)
            ? 'Yes'
            : 'No - if No, issue a follow-up CAR.';

        return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>CAR - Corrective Action Request</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eef2f7;
      font-family: Arial, Helvetica, sans-serif;
      color: #1b1b1b;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      padding: 7mm 11mm 5mm;
      position: relative;
      overflow: hidden;
    }

    .top-meta {
      display: grid;
      grid-template-columns: 1.2fr 1.2fr 1.25fr 0.9fr;
      gap: 4mm;
      align-items: end;
      font-size: 3.4mm;
      margin-bottom: 1.8mm;
    }

    .top-meta .line {
      min-height: 4.5mm;
    }

    .company-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2.6mm;
    }

    .company-name {
      font-size: 5.1mm;
      font-weight: 700;
    }

    .logo-wrap {
      text-align: right;
      color: #2d2d2d;
      font-size: 3mm;
      font-weight: 700;
    }

    .logo-wrap img {
      width: 38mm;
      height: auto;
      display: block;
      margin-left: auto;
      margin-bottom: 0.4mm;
    }

    .title {
      text-align: center;
      color: #1f56a8;
      font-weight: 700;
      margin: 0 0 2.6mm;
      line-height: 1.02;
    }

    .title .line1 {
      display: block;
      font-size: 5.4mm;
    }

    .title .line2 {
      display: block;
      font-size: 5.2mm;
    }

    .basic-grid {
      display: grid;
      grid-template-columns: 1.8fr 1fr;
      gap: 0 4.5mm;
      margin-bottom: 1.6mm;
    }

    .row {
      display: flex;
      align-items: baseline;
      min-width: 0;
      margin-bottom: 1.7mm;
    }

    .label {
      font-size: 3.8mm;
      white-space: nowrap;
      margin-right: 0.8mm;
    }

    .line {
      flex: 1;
      min-height: 4mm;
      border-bottom: 0.28mm dotted #6d6d6d;
      padding: 0 0.5mm 0.4mm;
      font-size: 3.35mm;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .line.wrap {
      white-space: normal;
      word-break: break-word;
    }

    .severity {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 3.8mm;
      margin-bottom: 2.3mm;
      color: #1f56a8;
      font-size: 4.2mm;
      font-weight: 700;
    }

    .check-row,
    .checkbox-grid {
      display: grid;
      gap: 1mm 4mm;
    }

    .checkbox-grid.sources {
      grid-template-columns: 1fr 1fr 1.3fr;
      margin-top: 0.8mm;
      margin-bottom: 1.8mm;
    }

    .checkbox-grid.nc {
      grid-template-columns: 1fr 1fr 0.9fr;
      margin-top: 0.4mm;
      margin-bottom: 1.4mm;
      padding-left: 7mm;
    }

    .check {
      display: flex;
      align-items: center;
      gap: 2mm;
      min-width: 0;
      font-size: 3.2mm;
      font-weight: 700;
    }

    .box {
      width: 4.3mm;
      height: 4.3mm;
      border: 0.4mm solid #7a7a7a;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #ffffff;
      color: #1f56a8;
      font-size: 3.05mm;
      line-height: 1;
    }

    .section-number {
      font-size: 4.1mm;
      margin-right: 2.2mm;
      flex-shrink: 0;
    }

    .section-title {
      font-size: 3.85mm;
      line-height: 1.2;
    }

    .section-head {
      display: flex;
      align-items: baseline;
      margin-bottom: 0.9mm;
    }

    .text-line {
      border-bottom: 0.28mm dotted #6d6d6d;
      min-height: 5.1mm;
      padding: 0.25mm 0.4mm 0.5mm;
      font-size: 3.15mm;
      line-height: 1.16;
      margin-bottom: 0.9mm;
      word-break: break-word;
    }

    .text-line.small-gap {
      margin-bottom: 0.5mm;
    }

    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
      margin-top: 1.5mm;
      margin-bottom: 0.8mm;
      padding-left: 7mm;
    }

    .signature-col .row {
      margin-bottom: 1.1mm;
    }

    .signature-note {
      text-align: center;
      font-size: 3.8mm;
      margin-top: -0.4mm;
      margin-bottom: 0.5mm;
    }

    .verify-row {
      display: grid;
      grid-template-columns: 1.3fr 0.9fr;
      gap: 4mm;
      margin-top: 1.2mm;
      padding-left: 7mm;
    }

    .footer {
      position: absolute;
      left: 11mm;
      right: 11mm;
      bottom: 2.6mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      color: #707070;
      font-size: 1.75mm;
    }

    .side-mark {
      position: absolute;
      right: 1mm;
      top: 12mm;
      writing-mode: vertical-rl;
      text-orientation: upright;
      font-size: 5.5mm;
      font-weight: 700;
      letter-spacing: -0.4mm;
      line-height: 0.85;
    }

    @media print {
      html, body {
        background: #ffffff;
      }

      .page {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-meta">
      <div class="row"><div class="label">To:</div><div class="line">${this.escapeHtml(this.getEmployeeLabel(car.to))}</div></div>
      <div class="row"><div class="label"></div><div class="line"></div></div>
      <div class="row"><div class="label">Circ:</div><div class="line"></div></div>
      <div class="row"><div class="label"></div><div class="line"></div></div>
    </div>

    <div class="company-row">
      <div class="company-name">Meinhardt (Thailand) Ltd.</div>
      <div class="logo-wrap">
        <img src="${logoUrl}" alt="Meinhardt">
        <div>32 - FORM MTNC-01</div>
      </div>
    </div>

    <h1 class="title">
      <span class="line1">CAR</span>
      <span class="line2">CORRECTIVE ACTION REQUEST</span>
    </h1>

    <div class="severity">
      <div class="check"><span class="box">${this.printCheckbox(car.severity === CarSeverity.MINOR)}</span><span>MINOR</span></div>
      <div class="check"><span class="box">${this.printCheckbox(car.severity === CarSeverity.MAJOR)}</span><span>MAJOR</span></div>
    </div>

    <div class="basic-grid">
      <div>
        <div class="row"><div class="label">Department:</div><div class="line">${this.escapeHtml(this.normalizePrintText(car.department))}</div></div>
        <div class="row"><div class="label">Project Name:</div><div class="line">${this.escapeHtml(this.normalizePrintText(car.projectName))}</div></div>
      </div>
      <div>
        <div class="row"><div class="label">Ref No.:</div><div class="line">${this.escapeHtml(this.normalizePrintText(car.refNo))}</div></div>
        <div class="row"><div class="label">Project No.:</div><div class="line">${this.escapeHtml(this.normalizePrintText(car.projectNo))}</div></div>
      </div>
    </div>

    <div class="row" style="margin-bottom: 1.3mm;">
      <div class="label">To:</div>
      <div class="line">${this.escapeHtml(this.getEmployeeLabel(car.to))}</div>
      <div class="label" style="margin-left: 2mm; font-weight:700;">(Must respond within 48 Hours for MJ, 7 days for MN)</div>
      <div class="label" style="margin-left: 2mm;">Date:</div>
      <div class="line">${this.escapeHtml(this.formatDate(car.date))}</div>
    </div>

    <div class="row" style="margin-bottom: 0.9mm;">
      <div class="label">CAR Issued By:</div>
      <div class="line">${this.escapeHtml(this.getEmployeeLabel(car.carIssuedBy))}</div>
    </div>

    <div class="checkbox-grid sources">
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.INTERNAL_IMS_AUDIT))}</span><span>Internal IMS Audit</span></div>
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.EXTERNAL_IMS_AUDIT))}</span><span>External IMS Audit</span></div>
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.MANAGEMENT_REVIEW))}</span><span>Management Review</span></div>
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.NON_CONFORMITY))}</span><span>Non-Conformity</span></div>
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.CLIENT_EXTERNAL_COMPLAINT))}</span><span>Client's or External Complaint</span></div>
      <div class="check"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.INCIDENT_REPORTING_INVESTIGATION))}</span><span>Incident Reporting &amp; Investigation</span></div>
      <div class="check" style="grid-column: 1 / 3;"><span class="box">${this.printCheckbox(sourceSet.has(CarSource.OTHERS) || !!this.normalizePrintText(car.otherSourceDescription, ''))}</span><span>Others</span><span class="line">${this.escapeHtml(this.normalizePrintText(car.otherSourceDescription, ''))}</span></div>
    </div>

    <div class="section-head">
      <div class="section-number">1.</div>
      <div class="section-title">Details of Non-Conformity: (completed by auditor / issuer)</div>
    </div>

    <div class="checkbox-grid nc">
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.NOT_CONFORM_CLIENT_REQUIREMENTS))}</span><span>Not conform to client's requirements</span></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.VE_REQUESTED_MTL_DESIGN))}</span><span>VE has been requested on MTL's Design</span></div>
      <div></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.ERROR_IN_DESIGN))}</span><span>Error in design</span></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.NOT_COMPLY_LAW_REGULATIONS))}</span><span>Not comply with law and related regulations</span></div>
      <div></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.ENVIRONMENTAL_ISSUE))}</span><span>Environmental issue</span></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.HEALTH_SAFETY_ISSUE))}</span><span>Health &amp; Safety issue</span></div>
      <div></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.NOT_FOLLOW_PROCEDURES))}</span><span>Not follow the Procedures</span></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.OBJECTIVES_NOT_MET))}</span><span>Objectives not met</span></div>
      <div class="check"><span class="box">${this.printCheckbox(nonConformitySet.has(NonConformityType.OTHER_ISSUES))}</span><span>Other issues</span></div>
    </div>

    <div class="row" style="margin-bottom: 0.7mm;"><div class="label">Description</div><div class="line"></div></div>
    ${this.getPrintTextRows(car.nonConformityDescription, 2)}

    <div class="section-head" style="margin-top: 1.1mm;">
      <div class="section-number">2.</div>
      <div class="section-title">Disposition of Non-Conformity (by Auditee / responsible person):</div>
    </div>

    <div class="row" style="margin-bottom: 0.7mm;"><div class="label">Cause of Non-conformity:</div><div class="line"></div></div>
    ${this.getPrintTextRows(car.causeOfNonConformity, 1)}
    <div class="row" style="margin-bottom: 0.7mm;"><div class="label">Remedial Action:</div><div class="line"></div></div>
    ${this.getPrintTextRows(car.remedialAction, 1)}
    <div class="row" style="margin-bottom: 0.7mm;"><div class="label">Corrective Action:</div><div class="line"></div></div>
    ${this.getPrintTextRows(car.correctiveAction, 2)}

    <div class="row" style="margin-top: 0.4mm; margin-bottom: 1mm;"><div class="label">Due date for completion:</div><div class="line">${this.escapeHtml(this.formatDate(car.dueDate))}</div></div>

    <div class="signature-grid">
      <div class="signature-col">
        <div class="row"><div class="label">Completed by:</div><div class="line">${this.escapeHtml(this.getEmployeeLabel(car.completedBy))}</div></div>
        <div class="signature-note">(Responsible Person)</div>
        <div class="row" style="justify-content:center;"><div class="label">Date:</div><div class="line" style="max-width: 70mm;">${this.escapeHtml(this.formatDate(this.getStepDate(2)))}</div></div>
      </div>
      <div class="signature-col">
        <div class="row"><div class="label">Acknowledged by:</div><div class="line">${this.escapeHtml(this.getEmployeeLabel(car.acknowledgedBy))}</div></div>
        <div class="signature-note">(MD/DI/TL/Supervisor of Responsible Person)</div>
        <div class="row" style="justify-content:center;"><div class="label">Date:</div><div class="line" style="max-width: 60mm;">${this.escapeHtml(this.formatDate(this.getStepDate(3)))}</div></div>
      </div>
    </div>

    <div class="section-head" style="margin-top: 0.6mm;">
      <div class="section-number">3.</div>
      <div class="section-title">Follow Up Remedial and Corrective Results (completed by auditor/ issuer):</div>
    </div>

    <div class="check" style="padding-left:7mm; margin-bottom: 0.8mm;"><span class="box">${this.printCheckbox(this.toBoolean(car.raCaSatisfactory))}</span><span>RA &amp; CA satisfactory:</span><span class="line"></span></div>
    ${this.getPrintTextRows(car.raCaSatisfactoryDescription, 2, 'padding-left: 13mm;')}
    <div class="check" style="padding-left:7mm; margin-bottom: 0.5mm;"><span class="box">${this.printCheckbox(this.toBoolean(car.furtherActionRequired))}</span><span>Further Action to be taken specify:</span><span class="line"></span></div>
    ${this.getPrintTextRows(car.furtherActionDescription, 2, 'padding-left: 13mm;')}

    <div class="verify-row">
      <div class="row"><div class="label">Verified by:</div><div class="line">${this.escapeHtml(this.getEmployeeLabel(car.verifiedBy))}</div><div class="label" style="margin-left: 1.4mm;">(Issuer)</div></div>
      <div class="row"><div class="label">Date:</div><div class="line">${this.escapeHtml(this.formatDate(this.getFinalVerifiedDate()))}</div></div>
    </div>

    <div class="section-head" style="margin-top: 1mm;">
      <div class="section-number">4.</div>
      <div class="section-title">Review by IMR:</div>
    </div>

    <div class="row" style="padding-left:7mm; margin-bottom: 0.6mm;"><div class="label">Comments / Is it a new risk?</div><div class="line"></div></div>
    ${this.getPrintTextRows(car.imrComments, 2, 'padding-left: 7mm;')}

    <div class="row" style="padding-left:7mm; margin-top: 0.3mm; margin-bottom: 0.7mm;">
      <div class="label">Did recipient respond in the specified time?</div>
      <div class="label" style="margin-left: 5mm;">${this.escapeHtml(responseTimeText)}</div>
    </div>
    <div class="text-line" style="padding-left:7mm;"></div>

    <div class="verify-row" style="padding-left:0; margin-top: 1mm;">
      <div class="row"><div class="label">Approved by:</div><div class="line">${this.escapeHtml(this.getEmployeeLabel(car.approvedBy))}</div><div class="label" style="margin-left: 1.4mm;">(IMR)</div></div>
      <div class="row"><div class="label">Date:</div><div class="line">${this.escapeHtml(this.formatDate(this.getFinalApprovedDate()))}</div></div>
    </div>

    <div class="side-mark">CI</div>

    <div class="footer">
      <div>M/MTL_INDEx/IMS DOCUMENTATION/FORMS/MTNC-01-CORRECTIVE ACTION REQUEST</div>
      <div>Page 1 of 1</div>
    </div>
  </div>
</body>
</html>`;
    }

    private getPrintTextRows(value: string | null | undefined, rows: number, extraStyle: string = ''): string {
        const chunks = this.chunkPrintText(this.normalizePrintText(value, ''), 125, rows);
        const filledRows = Array.from({ length: rows }, (_, index) => chunks[index] || '');
        return filledRows
            .map(row => `<div class="text-line${rows === 1 ? ' small-gap' : ''}" style="${extraStyle}">${this.escapeHtml(row)}</div>`)
            .join('');
    }

    private chunkPrintText(value: string, maxCharsPerRow: number, maxRows: number): string[] {
        const normalized = value.replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return [];
        }

        const words = normalized.split(' ');
        const rows: string[] = [];
        let current = '';

        for (const word of words) {
            const next = current ? `${current} ${word}` : word;
            if (next.length <= maxCharsPerRow) {
                current = next;
                continue;
            }

            if (current) {
                rows.push(current);
                if (rows.length === maxRows) {
                    return rows;
                }
            }

            current = word;
        }

        if (current && rows.length < maxRows) {
            rows.push(current);
        }

        return rows.slice(0, maxRows);
    }

    private normalizePrintText(value: unknown, fallback: string = '-'): string {
        if (value === null || value === undefined) {
            return fallback;
        }

        const normalized = String(value).trim();
        return normalized || fallback;
    }

    private toBoolean(value: boolean | number | null | undefined): boolean {
        return value === true || value === 1;
    }

    private printCheckbox(checked: boolean): string {
        return checked ? '&#10003;' : '';
    }

    private escapeHtml(value: unknown): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
