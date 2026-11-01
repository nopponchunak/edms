import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator'; // ✅ NEW
import { MatMenuModule } from '@angular/material/menu';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { PurchaseRequisitionService, PurchaseRequisitionsPageRequest, PurchaseRequisitionRow } from 'app/core/services/purchase-requisition.service';
import { PurchaseRequisitionNotificationService } from 'app/core/services/purchase-requisition-notification.service';
import { firstValueFrom, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { getCurrentUserCode, filterPurchaseRequisitionActionRequests, isApproved, isRejected } from 'app/core/utils/action-request-filter.util';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { fetchAllPagedRows } from 'app/core/utils/paged-export.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
  id: string;
  request: PurchaseRequisitionRow;
  actionType: 'verified_by_is_status' | 'verified_by_status' | 'approved_by_status' | 'approved_by_2_status' | 'acknowledged_by_status' | 'action_by_admin';
  currentStatus: string | null;
}

@Component({
  selector: 'app-purchase-requisition-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatPaginatorModule, // ✅ NEW (ต้องมี ถ้าคุณใส่ <mat-paginator> ใน HTML)
    MatMenuModule,
    FuseAlertComponent,
    PurchaseFormsFilterComponent,
    RouterLink
  ],
  templateUrl: './purchase-requisition-list.component.html',
  styleUrls: ['./purchase-requisition-list.component.scss']
})
export class PurchaseRequisitionListComponent implements OnInit, OnDestroy {
  private _unsubscribeAll: Subject<any> = new Subject<any>();
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'purchase-requisition';

  /** ข้อมูลที่โหลดมาของ "หน้าปัจจุบัน" */
  purchaseRequisitions: PurchaseRequisitionRow[] = [];
  allData: PurchaseRequisitionRow[] = [];

  /** ใช้แสดงในตาราง (Forms tab) */
  filteredPurchaseRequisitions: PurchaseRequisitionRow[] = [];

  isLoading = false;
  submittingDraftId: string | null = null;

  // Action requests
  actionRequests: ActionRequestItem[] = [];

  // Alert
  alert: { type: FuseAlertType; message: string } | null = null;

  // filters
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = ''; // retained for the shared filter component; PR has no project-type field

  // Tab: 'all' | 'approved' | 'my' | 'pending' | 'action'
  currentTab: 'all' | 'approved' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;

  // ✅ NEW: server-side pagination
  pageIndex = 0;
  pageSize = 10;
  totalRecords = 0; // ใช้ผูกกับ paginator [length]
  private actionRequestTotal = 0;
  employeeLookup = new Map<string, string>();
  listSort: ListSortEvent = { column: 0, dir: 'desc' };
  actionListSort: ListSortEvent = { column: 0, dir: 'desc' };

  // Filter config
  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Purchase Requisitions',
	    searchPlaceholder: 'Search by subject / to / requested by / reasons...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'pending', label: 'Pending' },
      { value: 'reject', label: 'Rejected' },
      { value: 'approve', label: 'Approved' }
    ],
    statusLabelFn: (value: string) => this.getStatusLabel(value),
    thirdFilterLabel: '',
    thirdFilterOptions: [],
    showThirdFilter: false
  };

  constructor(
    private router: Router,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private fuseConfirmationService: FuseConfirmationService,
    private purchaseRequisitionNotificationService: PurchaseRequisitionNotificationService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.loadRequisitions();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  // ✅ NEW: paginator change -> reload API
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadRequisitions();
  }

  onListSortChange(event: ListSortEvent): void {
    this.listSort = event;
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  loadRequisitions(): void {
    this.isLoading = true;
    this.alert = null;

    if (this.currentTab !== 'action') {
      this.loadActionRequestCount();
    }

    const isActionTab = this.currentTab === 'action';
    const request = this.buildPageRequest(
      this.pageIndex * this.pageSize,
      this.pageSize
    );

    this.purchaseRequisitionService.findAllPaginated(request)
      .pipe(
        takeUntil(this._unsubscribeAll),
        catchError((err) => {
          this.alert = {
            type: 'error',
            message: err?.error?.message || 'Failed to load purchase requisitions. Please try again.'
          };
          return of({
            currentPage: 1,
            data: [],
            total: 0,
            perPage: this.pageSize
          } as any);
        }),
        finalize(() => this.isLoading = false)
      )
      .subscribe((response: any) => {
        const items: PurchaseRequisitionRow[] = response.data ?? [];
        this.registerEmployeeLabels(items);

        const total = response.total ?? items.length;

        this.allData = items;
        this.purchaseRequisitions = [...items];

        if (isActionTab) {
          this.filteredPurchaseRequisitions = [];
          this.totalRecords = total;
          this.actionRequestTotal = total;
          this.buildActionRequests();
        } else {
          this.purchaseRequisitions = [...items];
          this.filteredPurchaseRequisitions = [...items];
          this.totalRecords = total;
        }
      });
  }

  private buildPageRequest(
    start: number,
    length: number,
    tab = this.currentTab,
    searchTerm = this.searchTerm,
    statusFilter = this.statusFilter
  ): PurchaseRequisitionsPageRequest {
    return {
      draw: 1,
      type: 'deposit',
      columns: [
        { data: 'id' },
        { data: 'subject' },
        { data: 'name' },
        { data: 'reasons_for_purchase' },
        { data: 'create_by' },
        { data: 'update_by' },
        { data: 'created_at' },
        { data: 'updated_at' },
        { data: 'action' }
      ],
      order: [tab === 'action' ? this.actionListSort : this.listSort],
      start,
      length,
      search: {
        value: searchTerm || '',
        regex: false
      },
      filters: {
        status: tab === 'approved' ? 'approve' : (statusFilter || ''),
        tab
      }
    };
  }

  /** ✅ แก้: filter -> โหลดใหม่จาก API (server-side) */
  onFilterChange(): void {
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = this.currentTab === 'approved' ? '' : filters.statusFilter || '';
    this.pageIndex = 0;
    this.loadRequisitions();
    this.closeFilterPanel();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  toggleFilterPanel(): void {
    this.showFilterPanel = !this.showFilterPanel;
  }

  closeFilterPanel(): void {
    this.showFilterPanel = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeFilterPanel();
  }

  get activeFilterCount(): number {
    return [this.searchTerm, this.statusFilter]
      .filter((value) => !!value).length;
  }

  // จำนวนทั้งหมดไว้โชว์ "x of y requisitions"
  get totalCount(): number {
    // ✅ ใช้ total จาก API จะถูกกว่า
    return this.totalRecords;
  }

  // จำนวนรายการที่ต้อง Action (ใช้ใน label แท็บ)
  get actionRequestCount(): number {
    return this.actionRequestTotal;
  }

  getRequisitionNo(req: PurchaseRequisitionRow | null | undefined): string {
    const prNo = (req?.prNo || '').trim();
    return prNo || (req?.id ? `PR-${req.id}` : '-');
  }

  getSubjectText(req: PurchaseRequisitionRow | null | undefined): string {
    const subject = String(req?.subject || '').trim();
    if (subject) {
      return subject;
    }

    const reasons = String(req?.reasons || '').trim();
    return reasons || '-';
  }

  /** เวลาเปลี่ยนแท็บ */
  onTabChange(tab: 'all' | 'approved' | 'my' | 'pending' | 'action'): void {
    if ((tab === 'all' || tab === 'approved') && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    if (tab === 'approved') {
      this.statusFilter = '';
    }
    this.closeFilterPanel();
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  /** สร้าง action requests array จาก purchase requisitions */
  private buildActionRequests(): void {
    // Get current user code from localStorage
    const userCode = getCurrentUserCode();

    // Filter action requests using utility function
    // This filters by user code AND workflow sequence
    this.actionRequests = filterPurchaseRequisitionActionRequests(
      this.allData,
      userCode
    );
  }

  private loadActionRequestCount(): void {
    const request = this.buildPageRequest(0, 1, 'action', '', '');

	    this.purchaseRequisitionService.findAllPaginated(request).subscribe({
	      next: (response: any) => {
          this.actionRequestTotal = Number(response.total ?? 0);
      },
      error: (error) => {
        console.error('Error loading action request count:', error);
      }
    });
  }

  // ปุ่มต่าง ๆ
  onCreateNew(): void {
    this.router.navigate(['/purchase-requisition/new']);
  }

  async onExportPurchaseRequisitions(): Promise<void> {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      return;
    }

    this.isLoading = true;
    this.alert = null;

    try {
        const items = await fetchAllPagedRows<PurchaseRequisitionRow>(async (start, length) => {
          return firstValueFrom(
            this.purchaseRequisitionService
              .findAllPaginated(this.buildPageRequest(start, length))
              .pipe(takeUntil(this._unsubscribeAll))
          );
        });
        this.registerEmployeeLabels(items);
        const exportEmployeeLookup = new Map(this.employeeLookup);
        const masterEmployeeLookup = await firstValueFrom(
          this.employeeService.getEmployeeLookupMap()
        );
        masterEmployeeLookup.forEach((label, reference) =>
          exportEmployeeLookup.set(reference, label)
        );

        if (items.length === 0) {
          this.alert = {
            type: 'warning',
            message: 'No data matches your filters to export.'
          };
          return;
        }

        // Export using xlsx
        const XLSX = await import('xlsx');
        const formattedRows = items.map(item => ({
          'PR No.': this.getRequisitionNo(item),
          'Status': this.getStatusLabel(this.getWorkflowStatus(item)),
          'Subject': item.subject || '-',
          'Created Date': this.formatDateTime(item.createdAt || item.date),
          'To': item.to || '-',
          'Requested By': this.getExportEmployeeLabel(item.requestedBy, exportEmployeeLookup),
          'Verified By IS': this.getExportEmployeeLabel(item.verifiedByIs, exportEmployeeLookup),
          'Verified By': this.getExportEmployeeLabel(item.verifiedBy, exportEmployeeLookup),
          'Approved By': this.getExportEmployeeLabel(item.approvedBy, exportEmployeeLookup),
          'Approved By 2': this.getExportEmployeeLabel(item.approvedBy2, exportEmployeeLookup),
          'Acknowledged By': this.getExportEmployeeLabel(item.acknowledgedBy, exportEmployeeLookup),
          'Action By Admin': this.getExportEmployeeLabel(item.actionByAdmin, exportEmployeeLookup),
          'Total': this.formatCurrency(item.totalAmount || 0, item.currency)
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Requisitions');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        XLSX.writeFile(workbook, `purchase-requisitions-${timestamp}.xlsx`);
    } catch (err: any) {
      this.alert = {
        type: 'error',
        message: err?.error?.message || err?.message || 'Failed to load purchase requisitions for export. Please try again.'
      };
    } finally {
      this.isLoading = false;
    }
  }

  onView(id: string): void {
    this.router.navigate(['/purchase-requisition/view', id]);
  }

  onEdit(item: PurchaseRequisitionRow): void {
    if (!this.navigationPermissionService.hasEditPermissionByNavId(this.permissionNavId) || !this.canEdit(item)) {
      return;
    }

    this.router.navigate(['/purchase-requisition/edit', item.id]);
  }

  // ใช้ในแท็บ Action Request
  onReview(id: string): void {
    this.router.navigate(['/purchase-requisition/review', id]);
  }

  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete',
      message: 'Are you sure you want to delete this purchase requisition?',
      icon: {
        show: true,
        name: 'heroicons_outline:exclamation-triangle',
        color: 'warn',
      },
      actions: {
        confirm: { show: true, label: 'Delete', color: 'warn' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result === 'confirmed') {
        this.purchaseRequisitionService.remove(id).subscribe({
          next: () => {
            this.alert = { type: 'success', message: 'Purchase requisition deleted successfully!' };
            this.loadRequisitions();
          },
          error: (error) => {
            console.error('Error deleting purchase requisition:', error);
            this.alert = {
              type: 'error',
              message: error?.error?.message || 'Failed to delete purchase requisition. Please try again.',
            };
          },
        });
      }
    });
  }

  canCreatePurchaseOrder(req: PurchaseRequisitionRow): boolean {
    const status = req.status?.toLowerCase();
    return status === 'approved' || status === 'acknowledged' || status === 'completed';
  }

  onCreatePurchaseOrder(id: string): void {
    this.router.navigate(['/purchase-order/new'], {
      queryParams: { fromRequisition: id }
    });
  }

  onSubmit(req: PurchaseRequisitionRow): void {
    if (!req?.id || this.submittingDraftId) {
      return;
    }

    this.alert = null;
    this.submittingDraftId = req.id;

    this.purchaseRequisitionService.findOne(req.id)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (requisition) => {
          const missingFields = this.getMissingSubmitFieldLabels(requisition, req);

          if (missingFields.length > 0) {
            this.showAlert('warning', this.buildMissingSubmitMessage(missingFields));
            this.submittingDraftId = null;
            return;
          }

          this.openSubmitDraftConfirmation(req.id);
        },
        error: (error) => {
          console.error('Error loading purchase requisition before submit:', error);
          this.showAlert('error', error?.error?.message || 'Failed to validate purchase requisition. Please try again.');
          this.submittingDraftId = null;
        }
      });
  }

  private openSubmitDraftConfirmation(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Submit Draft',
      message: 'Are you sure you want to submit this purchase requisition for approval?',
      icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
      actions: {
        confirm: { show: true, label: 'Submit', color: 'primary' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') {
        this.submittingDraftId = null;
        return;
      }

      this.purchaseRequisitionService.submit(id)
        .pipe(
          takeUntil(this._unsubscribeAll),
          finalize(() => this.submittingDraftId = null)
        )
        .subscribe({
          next: (requisition) => {
            this.showAlert('success', 'Purchase requisition submitted for approval!');
            this.purchaseRequisitionNotificationService
              .notifyInitialAction(requisition, id)
              .subscribe({
                error: (error) => {
                  console.error('Failed to send purchase requisition email notification:', error);
                  this.showAlert('warning', 'Purchase requisition submitted, but email notification could not be sent.');
                }
              });
            this.loadRequisitions();
          },
          error: (error) => {
            console.error('Error submitting purchase requisition:', error);
            this.showAlert('error', error?.error?.message || 'Failed to submit purchase requisition. Please try again.');
          },
        });
    });
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'pending': return 'Pending';
      case 'reject': return 'Rejected';
      case 'approve': return 'Approved';
      default: return status;
    }
  }

  getWorkflowStatus(item: PurchaseRequisitionRow): 'draft' | 'pending' | 'reject' | 'approve' {
    if (this.isDraftDocument(item)) {
      return 'draft';
    }

    const workflowSteps = this.getWorkflowSteps(item);
    const hasReject = workflowSteps.some(step => isRejected(step.status));
    if (hasReject) return 'reject';

    const allApproved = workflowSteps.length > 0 && workflowSteps.every(step => isApproved(step.status));
    if (allApproved) return 'approve';

    return 'pending';
  }

  private getWorkflowSteps(item: PurchaseRequisitionRow): Array<{ assignee: string | null | undefined; status: string | null | undefined }> {
    return [
      { assignee: item.verifiedByIs, status: item.verifiedByIsStatus },
      { assignee: item.verifiedBy, status: item.verifiedByStatus },
      { assignee: item.approvedBy, status: item.approvedByStatus },
      { assignee: item.approvedBy2, status: item.approvedBy2Status },
      { assignee: item.acknowledgedBy, status: item.acknowledgedByStatus },
      {
        assignee: item.actionByAdmin,
        status: item.actionByAdminDate ? 'approved' : 'pending'
      }
    ].filter(step => this.hasWorkflowAssignee(step.assignee));
  }

  private hasWorkflowAssignee(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  canEditOrDelete(item: PurchaseRequisitionRow): boolean {
    const status = this.getWorkflowStatus(item);
    return status === 'draft' || status === 'pending';
  }

  canEdit(item: PurchaseRequisitionRow): boolean {
    return this.isDraftDocument(item);
  }

  canSubmit(item: PurchaseRequisitionRow): boolean {
    return this.isDraftDocument(item);
  }

  getWorkflowStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'approve': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'reject': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    }
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string): string {
    return formatDateTimeDisplay(dateString);
  }

  formatCurrency(amount: number | string | null | undefined, currency?: string): string {
    const value = amount != null ? Number(amount) : 0;
    const currencyCode = currency || 'THB';
    const options: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: currencyCode,
    };

    try {
      return new Intl.NumberFormat('th-TH', options).format(Number.isFinite(value) ? value : 0);
    } catch {
      return new Intl.NumberFormat('th-TH', { ...options, currency: 'THB' }).format(Number.isFinite(value) ? value : 0);
    }
  }

  getStatusColor(status: string): string {
    const statusColors: { [key: string]: string } = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
  }

  getActionTypeText(actionType: ActionRequestItem['actionType']): string {
    switch (actionType) {
      case 'verified_by_is_status': return 'Verified By IS';
      case 'verified_by_status': return 'Verified By';
      case 'approved_by_status': return 'Approved By';
      case 'approved_by_2_status': return 'Approved By 2';
      case 'acknowledged_by_status': return 'Acknowledged By';
      case 'action_by_admin': return 'Action By';
      default: return 'Action';
    }
  }

  onActionListSortChange(event: ListSortEvent): void {
    this.actionListSort = event;
    this.pageIndex = 0;
    this.loadRequisitions();
  }

  getByStatusText(status: string | null | undefined): string {
    if (!status) return 'Pending';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'Pending';
      case 'reject': return 'Rejected';
      case 'approve': return 'Approved';
      default: return status;
    }
  }

  getByStatusColor(status: string | null | undefined): string {
    if (!status) return 'bg-yellow-100 text-yellow-800';
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approve': return 'bg-green-100 text-green-800';
      case 'reject': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    if (ref === null || ref === undefined) {
      return 'N/A';
    }

    const normalizedRef = String(ref).trim();
    if (!normalizedRef) {
      return 'N/A';
    }

    return this.employeeLookup.get(normalizedRef) ?? normalizedRef;
  }

  private getExportEmployeeLabel(
    ref: string | number | null | undefined,
    lookup: Map<string, string>
  ): string {
    const normalizedRef = String(ref ?? '').trim();
    if (!normalizedRef) {
      return '-';
    }

    return lookup.get(normalizedRef) || 'Employee not found';
  }

  private registerEmployeeLabels(items: PurchaseRequisitionRow[]): void {
    items.forEach((item) => {
      this.rememberEmployeeLabel(item.createdBy, item.createdByLabel);
      this.rememberEmployeeLabel(item.requestedBy, item.requestedByLabel);
      this.rememberEmployeeLabel(item.verifiedByIs, item.verifiedByIsLabel);
      this.rememberEmployeeLabel(item.verifiedBy, item.verifiedByLabel);
      this.rememberEmployeeLabel(item.approvedBy, item.approvedByLabel);
      this.rememberEmployeeLabel(item.approvedBy2, item.approvedBy2Label);
      this.rememberEmployeeLabel(item.acknowledgedBy, item.acknowledgedByLabel);
      this.rememberEmployeeLabel(item.actionByAdmin, item.actionByAdminLabel);
    });
  }

  private rememberEmployeeLabel(ref: string | number | null | undefined, label: string | null | undefined): void {
    const normalizedRef = String(ref ?? '').trim();
    const normalizedLabel = String(label ?? '').trim();
    if (!normalizedRef || !normalizedLabel) {
      return;
    }

    this.employeeLookup.set(normalizedRef, normalizedLabel);
  }

  private getMissingSubmitFieldLabels(response: any, row: PurchaseRequisitionRow): string[] {
    const requisition = this.unwrapApiResponse(response);
    const missing: string[] = [];
    const addIfBlank = (value: unknown, label: string): void => {
      if (this.isBlankValue(value)) {
        missing.push(label);
      }
    };

    const requestedBy = this.readFirstValue(requisition, ['requested_by', 'requestedBy', 'requestedById']);
    const approvedBy = this.readFirstValue(requisition, ['approved_by', 'approvedBy', 'approvedById']);
    const approvedBy2 = this.readFirstValue(requisition, ['approved_by_2', 'approvedBy2', 'approvedBy2Id']);
    const grandTotal = this.readNumberValue(requisition, ['grand_total', 'grandTotal', 'total_amount', 'totalAmount'], row.totalAmount);
    const reasonsForPurchase = this.readFirstValue(requisition, ['reasons_for_purchase', 'reasonsForPurchase', 'reasons']);

    addIfBlank(this.readFirstValue(requisition, ['to']), 'To');
    addIfBlank(requestedBy, 'Requested By');
    addIfBlank(this.readFirstValue(requisition, ['currency_code', 'currency']), 'Currency');
    addIfBlank(this.readFirstValue(requisition, ['date'], row.date), 'Date');
    addIfBlank(this.readFirstValue(requisition, ['verified_by', 'verifiedBy', 'verifiedById']), 'Verified By (MD/DI/AD/TL)');
    addIfBlank(approvedBy, 'Approved By');
    addIfBlank(this.readFirstValue(requisition, ['acknowledged_by', 'acknowledgedBy', 'acknowledgedById']), 'Acknowledged');
    addIfBlank(this.readFirstValue(requisition, ['action_by_admin', 'actionByAdmin', 'actionByAdminId']), 'Action By (Admin)');

    if (this.isBlankValue(reasonsForPurchase)) {
      missing.push('Reasons for Purchase');
    } else if (String(reasonsForPurchase).trim().length < 10) {
      missing.push('Reasons for Purchase (at least 10 characters)');
    }

    if (!this.hasValidDateValue(this.readFirstValue(requisition, ['date'], row.date))) {
      missing.push('Date');
    }

    if (this.requiresSecondApprover(grandTotal)) {
      addIfBlank(approvedBy2, 'Approved By 2');

      if (!this.isBlankValue(approvedBy) && !this.isBlankValue(approvedBy2) && String(approvedBy).trim() === String(approvedBy2).trim()) {
        missing.push('Approved By 2 must be different from Approved By');
      }
    }

    const items = Array.isArray(requisition?.items) ? requisition.items : [];
    if (items.length === 0) {
      missing.push('At least one item');
    } else {
      items.forEach((item: any, index: number) => {
        const itemPrefix = `Item ${index + 1}`;
        addIfBlank(this.readFirstValue(item, ['description']), `${itemPrefix} Description`);

        if (!this.hasPositiveNumberValue(this.readFirstValue(item, ['quantity']))) {
          missing.push(`${itemPrefix} Quantity`);
        }

        if (!this.hasNonNegativeNumberValue(this.readFirstValue(item, ['unit_price', 'unitPrice']))) {
          missing.push(`${itemPrefix} Unit Price`);
        }
      });
    }

    return Array.from(new Set(missing));
  }

  private buildMissingSubmitMessage(missingFields: string[]): string {
    const visibleFields = missingFields.slice(0, 12);
    const moreCount = missingFields.length - visibleFields.length;
    const moreText = moreCount > 0 ? `, and ${moreCount} more` : '';

    return `Cannot submit this draft. Please complete: ${visibleFields.join(', ')}${moreText}.`;
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private unwrapApiResponse(response: any): any {
    return response?.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : response;
  }

  private readFirstValue(source: any, keys: string[], fallback: unknown = null): unknown {
    if (!source) {
      return fallback;
    }

    for (const key of keys) {
      const value = source[key];
      if (!this.isBlankValue(value)) {
        return value;
      }
    }

    return fallback;
  }

  private readNumberValue(source: any, keys: string[], fallback: unknown = 0): number {
    const value = this.readFirstValue(source, keys, fallback);
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private requiresSecondApprover(grandTotal: number): boolean {
    return grandTotal > 50000;
  }

  private isDraftDocument(item: PurchaseRequisitionRow): boolean {
    return String(item.status || '').toLowerCase() === 'draft';
  }

  private isBlankValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    const text = String(value).trim();
    return text === '' || text === '-' || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined';
  }

  private hasValidDateValue(value: unknown): boolean {
    if (this.isBlankValue(value)) {
      return false;
    }

    if (value instanceof Date) {
      return !Number.isNaN(value.getTime());
    }

    const text = String(value).trim();
    if (text.startsWith('0000-00-00')) {
      return false;
    }

    const date = new Date(text);
    return !Number.isNaN(date.getTime());
  }

  private hasPositiveNumberValue(value: unknown): boolean {
    if (this.isBlankValue(value)) {
      return false;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0;
  }

  private hasNonNegativeNumberValue(value: unknown): boolean {
    if (this.isBlankValue(value)) {
      return false;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0;
  }
}
