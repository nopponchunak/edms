import { Component, OnInit, OnDestroy, HostListener, inject } from '@angular/core';
import { formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of, Subject } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator'; // ✅ แก้: เพิ่ม PageEvent
import { MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { PurchaseOrderService, PurchaseOrder, PurchaseOrdersPageRequest, PurchaseOrderRow } from 'app/core/services/purchase-order.service';
import { AuthenticatedPdfService } from 'app/core/services/authenticated-pdf.service';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { EmployeeService } from 'app/core/services/employee.service';
import { getCurrentUserCode, filterPurchaseOrderActionRequests } from 'app/core/utils/action-request-filter.util';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { PURCHASE_ORDER_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { fetchAllPagedRows } from 'app/core/utils/paged-export.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

interface ActionRequestItem {
  id: string;
  request: PurchaseOrderRow;
  actionType: 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status';
  currentStatus: string | null;
}

@Component({
  selector: 'app-purchase-order-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatTabsModule,
    FuseAlertComponent,
    PurchaseFormsFilterComponent,
    RouterLink,
  ],
  templateUrl: './purchase-order-list.component.html',
  styleUrls: ['./purchase-order-list.component.scss'],
})
export class PurchaseOrderListComponent implements OnInit, OnDestroy {
    listSort: ListSortEvent = { column: 0, dir: 'desc' };
  actionListSort: ListSortEvent = { column: 0, dir: 'desc' };
  private _unsubscribeAll: Subject<any> = new Subject<any>();
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'purchase-order';

  /** ข้อมูลทั้งหมด (ของหน้าปัจจุบันจาก API) */
  purchaseOrders: PurchaseOrderRow[] = [];
  allData: PurchaseOrderRow[] = [];

  /** ข้อมูลที่ใช้แสดงในตาราง (ของหน้าปัจจุบัน) */
  filteredPurchaseOrders: PurchaseOrderRow[] = [];

  isLoading = false;
  submittingDraftId: string | null = null;

  // Action requests
  actionRequests: ActionRequestItem[] = [];

  // คอลัมน์ในตาราง
  displayedColumns: string[] = [
    'poNo',
    'subject',
    'company',
    'to',
    'requisitionDate',
    'status',
    'grandTotal',
    'actions',
  ];

  // ตัวกรอง
  statusFilter = '';
  searchTerm = '';
  companyFilter = '';

  // Alert
  alert: { type: FuseAlertType; message: string } | null = null;

  // Tab: 'all' | 'approved' | 'my' | 'pending' | 'action'
  currentTab: 'all' | 'approved' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;

  // ✅ เพิ่ม: server-side pagination state
  pageIndex = 0;
  pageSize = 10;
  totalRecords = 0; // ✅ จำนวนทั้งหมดหลังกรองจาก API (เอาไปใช้กับ paginator length)
  private actionRequestTotal = 0;

  // Filter config
  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Purchase Orders',
    searchPlaceholder: 'Search by PO No., Subject, Company, or To...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'pending', label: 'Pending' },
      { value: 'reject', label: 'Rejected' },
      { value: 'approve', label: 'Approved' }
    ],
    statusLabelFn: (value: string) => this.getStatusLabel(value),
    thirdFilterLabel: 'Filter by Company',
    thirdFilterOptions: [],
    showThirdFilter: true
  };

  // จำนวนรายการที่ต้อง Action (ใช้ใน label แท็บ)
  get actionRequestCount(): number {
    return this.actionRequestTotal;
  }

  // ✅ เปลี่ยน: totalCount ต้องอิง totalRecords จาก API
  get totalCount(): number {
    return this.totalRecords;
  }

  constructor(
    private purchaseOrderService: PurchaseOrderService,
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private authenticatedPdfService: AuthenticatedPdfService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.loadPurchaseOrders();
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  updateFilterConfig(companies: string[] = []): void {
    this.filterConfig.thirdFilterOptions = companies.map(company => ({
      value: company,
      label: company
    }));
  }

  /** ✅ NEW: paginator change -> ยิง API */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPurchaseOrders();
  }

  /** โหลดข้อมูลจาก API (อิง pageIndex/pageSize/filter) */
  private loadPurchaseOrders(): void {
    this.isLoading = true;
    this.alert = null;

    if (this.currentTab !== 'action') {
      this.loadActionRequestCount();
    }

    const request = this.buildPageRequest(
      this.pageIndex * this.pageSize,
      this.pageSize
    );

    this.purchaseOrderService.findAllPaginated(request)
      .pipe(
        takeUntil(this._unsubscribeAll),
        catchError((err) => {
          this.alert = {
            type: 'error',
            message: err?.error?.message || 'Failed to load purchase orders. Please try again.'
          };
          // คืนค่าโครงสร้าง fallback
          return of({ data: [], total: 0 } as any);
        }),
        finalize(() => this.isLoading = false)
	      )
	      .subscribe((response) => {
	        const orders = response.data ?? [];

        this.allData = orders;
        this.purchaseOrders = [...orders];

        // ✅ ใช้ข้อมูลจาก API แสดงตรงๆ (ไม่ filter client-side)
        if (this.currentTab === 'action') {
          this.filteredPurchaseOrders = [];
        } else {
          this.purchaseOrders = [...orders];
          this.filteredPurchaseOrders = [...orders];
        }

        // ✅ total สำหรับ paginator
        this.totalRecords = response.total ?? orders.length;
        if (this.currentTab === 'action') {
          this.actionRequestTotal = this.totalRecords;
        }

        // อัปเดตตัวเลือก company จากข้อมูลที่โหลดมา (หน้าเดียว)
        this.updateFilterConfig(response.companyOptions || []);

        // สร้าง action request เมื่ออยู่แท็บ Action
        if (this.currentTab === 'action') {
          this.buildActionRequests();
        }
      });
  }

  private buildPageRequest(start: number, length: number): PurchaseOrdersPageRequest {
    const status = this.currentTab === 'approved'
      ? 'approve'
      : this.statusFilter || '';

    return {
      draw: 1,
      type: 'deposit',

      // columns/order ถ้า backend ใช้ตามเดิมก็เก็บไว้
      columns: [
        { data: 'No' },
        { data: 'name' },
        { data: 'create_by' },
        { data: 'update_by' },
        { data: 'created_at' },
        { data: 'updated_at' },
        { data: 'action' }
      ],
      order: [this.currentTab === 'action' ? this.actionListSort : this.listSort],

      // ✅ แก้: อิง paginator จริง
      start,
      length,

      // ✅ search ส่งไป API
      search: { value: this.searchTerm || '', regex: false },

      // ✅ ถ้า backend รองรับ filters ให้ส่งไปด้วย (ถ้าไม่รองรับ ลบบล็อกนี้ทิ้งได้)
      // @ts-ignore
      filters: {
        status,
        company: this.companyFilter || '',
        tab: this.currentTab,
      }
    };
  }

  /** สร้าง action requests array จาก purchase orders */
  private buildActionRequests(): void {
    // Get current user code from localStorage
    const userCode = getCurrentUserCode();

    // Filter action requests using utility function
    // This filters by user code AND workflow sequence
    this.actionRequests = filterPurchaseOrderActionRequests(
      this.allData,
      userCode
    );
  }

  private loadActionRequestCount(): void {
    const request = this.buildPageRequest(0, 1);
    request.search.value = '';
    request.filters = {
      status: '',
      company: '',
      tab: 'action'
    };
    request.order = [this.actionListSort];

    this.purchaseOrderService.findAllPaginated(request)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
      next: (response) => {
        this.actionRequestTotal = Number(response.total ?? 0);
      },
      error: (error) => {
        console.error('Error loading action request count:', error);
      }
    });
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

    // ✅ แนะนำ: เปลี่ยนแท็บให้กลับหน้าแรก
    this.pageIndex = 0;

    // Action tab uses the same server-side pagination contract as the forms tabs.
    this.loadPurchaseOrders();
  }

  // ✅ เปลี่ยน: ฟิลเตอร์/ค้นหา = ยิง API (ไม่ filter ในหน้าเว็บแล้ว)
  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.pageIndex = 0;
    this.loadPurchaseOrders();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.pageIndex = 0;
    this.loadPurchaseOrders();
  }

  onCompanyFilterChange(value: string): void {
    this.companyFilter = value || '';
    this.pageIndex = 0;
    this.loadPurchaseOrders();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = this.currentTab === 'approved' ? '' : filters.statusFilter || '';
    this.companyFilter = filters.thirdFilter || '';
    this.pageIndex = 0;
    this.loadPurchaseOrders();
    this.closeFilterPanel();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.companyFilter = '';
    this.pageIndex = 0;
    this.loadPurchaseOrders();
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
    return [
      this.searchTerm,
      this.currentTab === 'approved' ? '' : this.statusFilter,
      this.companyFilter
    ]
      .filter((value) => !!value).length;
  }

  // navigation
  onCreateNew(): void {
    this.router.navigate(['/purchase-order/new']);
  }

  async onExportPurchaseOrders(): Promise<void> {
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      return;
    }

    this.isLoading = true;
    this.alert = null;

    try {
        const orders = await fetchAllPagedRows<PurchaseOrderRow>(async (start, length) => {
          return firstValueFrom(
            this.purchaseOrderService
              .findAllPaginated(this.buildPageRequest(start, length))
              .pipe(takeUntil(this._unsubscribeAll))
          );
        });
        const employeeLookup = await firstValueFrom(
          this.employeeService.getEmployeeLookupMap()
        );

        if (orders.length === 0) {
          this.alert = {
            type: 'warning',
            message: 'No data matches your filters to export.'
          };
          return;
        }

        // Export using xlsx
        const XLSX = await import('xlsx');
        const formattedRows = orders.map(item => ({
          'PO No.': item.poNo || 'Pending',
          'Status': this.getStatusLabel(this.getWorkflowStatus(item)),
          'Subject': item.subject || '-',
          'Company': item.company || '-',
          'To': item.to || '-',
          'Requisition Date': this.formatDate(item.requisitionDate),
          'Quotation No.': item.quotationNo || '-',
          'Requested By': this.getExportEmployeeLabel(item.purchaseRequestBy, employeeLookup),
          'Spare Part Verified By': this.getExportEmployeeLabel(item.verifiedBy, employeeLookup),
          'Approved By': this.getExportEmployeeLabel(item.approvedBy, employeeLookup),
          'CIRC': this.getExportEmployeeLabel(item.circ, employeeLookup),
          'Signed By': this.getExportEmployeeLabel(item.signedBy, employeeLookup),
          'Acknowledged By': this.getExportEmployeeLabel(item.acknowledgedBy, employeeLookup),
          'Created By': this.getExportEmployeeLabel(item.createdBy, employeeLookup),
          'Total': this.formatCurrency(item.grandTotal || 0, item.currency)
        }));

        const worksheet = XLSX.utils.json_to_sheet(formattedRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Orders');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        XLSX.writeFile(workbook, `purchase-orders-${timestamp}.xlsx`);
    } catch (err: any) {
      this.alert = {
        type: 'error',
        message: err?.error?.message || err?.message || 'Failed to load purchase orders for export. Please try again.'
      };
    } finally {
      this.isLoading = false;
    }
  }

  onView(id: string): void {
    this.router.navigate(['/purchase-order', id]);
  }

  onOpenPrintPdf(po: PurchaseOrderRow): void {
    if (!this.canOpenCombinedPdf(po)) {
      return;
    }

    this.authenticatedPdfService.open(this.purchaseOrderService.getPrintPdfUrl(po.id));
  }

  onOpenCombinedPdf(po: PurchaseOrderRow): void {
    if (!this.canOpenCombinedPdf(po)) {
      return;
    }

    this.authenticatedPdfService.open(this.purchaseOrderService.getCombinedPdfUrl(po.id));
  }

  onEdit(id: string): void {
    this.router.navigate(['/purchase-order', id, 'edit']);
  }

  onReview(id: string): void {
    this.router.navigate(['/purchase-order', id, 'review']);
  }

  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete',
      message: 'Are you sure you want to delete this purchase order?',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'Delete', color: 'warn' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result === 'confirmed') {
        this.purchaseOrderService.remove(id).subscribe({
          next: () => {
            this.alert = { type: 'success', message: 'Purchase order deleted successfully!' };
            // หลังลบ แนะนำโหลดหน้าเดิมใหม่
            this.loadPurchaseOrders();
          },
          error: (error) => {
            console.error('Error deleting purchase order:', error);
            this.alert = { type: 'error', message: 'Failed to delete purchase order. Please try again.' };
          },
        });
      }
    });
  }

  onSubmit(po: PurchaseOrderRow): void {
    if (!po?.id || this.submittingDraftId) {
      return;
    }

    this.alert = null;
    this.submittingDraftId = po.id;

    this.purchaseOrderService.findOne(po.id)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (purchaseOrder) => {
          const missingFields = this.getMissingSubmitFieldLabels(purchaseOrder, po);

          if (missingFields.length > 0) {
            this.showAlert('warning', this.buildMissingSubmitMessage(missingFields));
            this.submittingDraftId = null;
            return;
          }

          this.openSubmitDraftConfirmation(po.id);
        },
        error: (error) => {
          console.error('Error loading purchase order before submit:', error);
          this.showAlert('error', error?.error?.message || 'Failed to validate purchase order. Please try again.');
          this.submittingDraftId = null;
        }
      });
  }

  private openSubmitDraftConfirmation(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Submit Draft',
      message: 'Are you sure you want to submit this purchase order for approval?',
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

      this.purchaseOrderService.submit(id)
        .pipe(
          takeUntil(this._unsubscribeAll),
          finalize(() => this.submittingDraftId = null)
        )
        .subscribe({
          next: (purchaseOrder) => {
            this.showAlert('success', 'Purchase order submitted for approval!');
            this.workflowEmailNotificationService
              .notifyInitialAction(PURCHASE_ORDER_EMAIL_CONFIG, purchaseOrder, purchaseOrder.id)
              .subscribe({
                error: (error) => {
                  console.error('Failed to send purchase order email notification:', error);
                  this.showAlert('warning', 'Purchase order submitted, but email notification could not be sent.');
                }
              });
            this.loadPurchaseOrders();
          },
          error: (error) => {
            console.error('Error submitting purchase order:', error);
            this.showAlert('error', error?.error?.message || 'Failed to submit purchase order. Please try again.');
          },
        });
    });
  }

  private getMissingSubmitFieldLabels(purchaseOrder: PurchaseOrder, row: PurchaseOrderRow): string[] {
    const missing: string[] = [];
    const addIfBlank = (value: unknown, label: string): void => {
      if (this.isBlankValue(value)) {
        missing.push(label);
      }
    };

    addIfBlank(purchaseOrder.to, 'To');
    addIfBlank(purchaseOrder.company, 'Company');
    addIfBlank(purchaseOrder.from, 'From');
    addIfBlank(purchaseOrder.currency, 'Currency');
    addIfBlank(purchaseOrder.purchaseRequestBy, 'Purchase Request by');
    addIfBlank(purchaseOrder.approvedBy, 'Approved By');
    addIfBlank(purchaseOrder.signedBy, 'Signed by');
    addIfBlank(purchaseOrder.acknowledgedBy, 'Acknowledged by');

    if (!this.hasValidDateValue(row.requisitionDate)) {
      missing.push('Requisition Date');
    }

    if (!Array.isArray(purchaseOrder.items) || purchaseOrder.items.length === 0) {
      missing.push('At least one item');
    } else {
      purchaseOrder.items.forEach((item, index) => {
        const itemPrefix = `Item ${index + 1}`;
        addIfBlank(item.description, `${itemPrefix} Description`);

        if (!this.hasPositiveNumberValue(item.quantity)) {
          missing.push(`${itemPrefix} Quantity`);
        }

        if (!this.hasNonNegativeNumberValue(item.unitPrice)) {
          missing.push(`${itemPrefix} Unit Price`);
        }

        if (item.needAssetCodeRegistration && this.isBlankValue(item.assetCode)) {
          missing.push(`${itemPrefix} Asset Code`);
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

  private isDraftDocument(item: PurchaseOrderRow): boolean {
    return String(item.status || '').toUpperCase() === 'DRAFT';
  }

  getWorkflowStatus(item: PurchaseOrderRow): 'draft' | 'pending' | 'reject' | 'approve' {
    if (this.isDraftDocument(item)) {
      return 'draft';
    }

    const steps = [
      { by: item.verifiedBy, status: item.verifiedByStatus },
      { by: item.approvedBy, status: item.approvedByStatus },
      { by: item.circ, status: item.circStatus },
      { by: item.signedBy, status: item.signedByStatus },
      { by: item.acknowledgedBy, status: item.acknowledgedByStatus }
    ].filter(step => this.hasWorkflowAssignee(step.by));
    const hasReject = steps.some(step => step.by && (step.status?.toLowerCase() === 'reject' || step.status?.toLowerCase() === 'rejected'));
    if (hasReject) return 'reject';
    
    const allApproved = steps.length > 0 && steps.every(step => {
      return step.status?.toLowerCase() === 'approve' || step.status?.toLowerCase() === 'approved';
    });
    if (allApproved) return 'approve';
    
    return 'pending';
  }

  private hasWorkflowAssignee(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  getWorkflowStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'approve': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'reject': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'draft': return 'Draft';
      case 'pending': return 'Pending';
      case 'reject': return 'Rejected';
      case 'rejected': return 'Rejected';
      case 'approve': return 'Approved';
      case 'approved': return 'Approved';
      default: return status;
    }
  }

  getListTitle(): string {
    switch (this.currentTab) {
      case 'all':
        return 'All Purchase Orders';
      case 'approved':
        return 'Approved Purchase Orders';
      case 'my':
        return 'My Purchase Orders';
      default:
        return 'Pending Purchase Orders';
    }
  }

  canEdit(po: PurchaseOrderRow): boolean {
    return this.getWorkflowStatus(po) === 'draft' || this.getWorkflowStatus(po) === 'pending';
  }

  canSubmit(po: PurchaseOrderRow): boolean {
    return this.isDraftDocument(po);
  }

  canDelete(po: PurchaseOrderRow): boolean {
    return this.getWorkflowStatus(po) === 'draft' || this.getWorkflowStatus(po) === 'pending';
  }

  canOpenCombinedPdf(po: PurchaseOrderRow): boolean {
    return this.currentTab === 'approved' && this.getWorkflowStatus(po) === 'approve';
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

  formatDate(date: Date | string): string {
    return formatDateTimeDisplay(date);
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

  // Helper functions for action requests
  getActionTypeText(actionType: 'verified_by_status' | 'approved_by_status' | 'circ_status' | 'signed_by_status' | 'acknowledged_by_status'): string {
    switch (actionType) {
      case 'verified_by_status': return 'Verified By';
      case 'approved_by_status': return 'Approved By';
      case 'circ_status': return 'Circ';
      case 'signed_by_status': return 'Signed By';
      case 'acknowledged_by_status': return 'Acknowledged By';
      default: return 'Action';
    }
  }

  onActionListSortChange(event: ListSortEvent): void {
    this.actionListSort = event;
    this.pageIndex = 0;
    this.loadPurchaseOrders();
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
      case 'approved': return 'bg-green-100 text-green-800';
      case 'reject': return 'bg-red-100 text-red-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadPurchaseOrders();
    }
}
