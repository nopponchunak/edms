import { Component, HostListener, OnInit, inject } from '@angular/core';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';

import {
  canCreateFeeSheetRevision,
  canEditCurrentFeeSheet,
  FeeSheetRow,
  FeeSheetService,
} from '../../../core/services/fee-sheet.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface ProjectTransportationFeeSheet extends FeeSheetRow {}

@Component({
  selector: 'app-project-transportation-fee-sheet-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    PurchaseFormsFilterComponent,
    FuseAlertComponent
  ],
  templateUrl: './project-transportation-fee-sheet-list.component.html',
  styleUrls: ['./project-transportation-fee-sheet-list.component.scss']
})
export class ProjectTransportationFeeSheetListComponent implements OnInit {
  readonly listSortColumns = ['proposal_number', 'created_at', 'project_name', 'project_number', 'project_type', 'nett_fee', 'filled_in_by', 'status'];
  listSort: ListSortEvent = { column: 0, dir: 'desc' };
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'project-transportation-fee-sheet';

  /** Tabs */
  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;
  actionRequestCount = 0;

  /** Filters */
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';

  /** Table columns */
  displayedColumns: string[] = [
    'projectPNo',
    'createdAt',
    'projectName',
    'projectNo',
    'projectType',
    'nettFee',
    'filledInBy',
    'status',
    'actions'
  ];

  actionDisplayedColumns: string[] = [
    'projectPNo',
    'projectName',
    'nettFee',
    'filledInBy',
    'actionStep',
    'status',
    'action'
  ];

  dataSource: ProjectTransportationFeeSheet[] = [];
  filteredData: ProjectTransportationFeeSheet[] = [];

  /** Pagination (client-side จาก filteredData) */
  totalRecords = 0;
  pageSize = 10;
  pageIndex = 0;
  employeeLookup = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Transportation Fee Sheets',
    searchPlaceholder: 'Search by Project Name / No. / Filled In By...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
    ],
    statusLabelFn: (value: string) => this.getStatusLabel(value),
    thirdFilterLabel: 'Filter by Project Type',
    thirdFilterOptions: [],
    showThirdFilter: true,
  };

  // ใช้ตัวนี้ใน *ngFor ที่ HTML
  get displayedFilteredDataSource(): ProjectTransportationFeeSheet[] {
    return this.filteredData;
  }

  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  constructor(
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private feeSheetService: FeeSheetService,
    private employeeService: EmployeeService,
  ) { }

  ngOnInit(): void {
    this.employeeService.getEmployeeLookupMap().subscribe((lookup) => {
      this.employeeLookup = lookup;
    });
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.loadFeeSheets();
  }

  /** LOAD DATA (API จริง) */
  loadFeeSheets(page: number = 1): void {
    this.isLoading = true;

    this.feeSheetService.listByType('transportation', page, this.pageSize, this.listSortColumns[this.listSort.column] ?? 'created_at', this.listSort.dir).subscribe({
      next: (res) => {
        this.dataSource = (res.items ?? []) as ProjectTransportationFeeSheet[];

        /** Count Action Request */
        this.actionRequestCount = this.getActionRequestCount();
        this.totalRecords = res.total ?? this.dataSource.length;
        this.updateFilterConfigFrom(this.dataSource);

        /** Apply Filters */
        this.applyFilters(false);

        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.showAlert('error', err?.error?.message ?? err?.message ?? 'Load transportation fee sheets failed');
      }
    });
  }

  /** MAP API -> ROW (✅ แก้ให้ใช้ current_revision ก่อน project) */
  private mapApiToRow(x: any): ProjectTransportationFeeSheet {
    const project = x?.project ?? {};
    const rev = x?.current_revision ?? {};

    const disciplineName =
      rev?.discipline?.name ??
      rev?.discipline?.code ??
      String(rev?.discipline_id ?? '-');

    const projectTypeName =
      rev?.project_type?.name ??
      rev?.project_type?.code ??
      String(rev?.project_type_id ?? '-');

    const fee0 = Array.isArray(rev?.fee_agreements) ? rev.fee_agreements[0] : null;
    const status = rev?.status ?? 'draft';

    return {
      id: String(x?.id ?? ''),

      // ✅ mt_project_no ของ fee sheet (ตาม API ของคุณ)
      projectPNo: String(x?.mt_project_no ?? '-'),

      // ✅ project_no ของ project table
      projectNo: String(project?.project_no ?? '-'),

      // ✅ สำคัญ: แสดงค่าที่กรอกล่าสุดจาก revision ก่อน
      projectName: String(rev?.project_name ?? project?.project_name ?? '-'),
      client: String(rev?.client_name ?? project?.client_name ?? '-'),

      discipline: String(disciplineName),
      projectType: String(projectTypeName),

      grossFee: Number(fee0?.gross_fee_excl_vat ?? 0),
      nettFee: Number(fee0?.net_fee_excl_vat ?? 0),

      status: String(status),

      // ตอนนี้โชว์เป็น id ก่อน ถ้าจะเป็นชื่อ ต้อง map employee เพิ่ม
      filledInBy: String(rev?.form_filled_by_id ?? project?.filled_in_by ?? '-'),
      approvedBy: String(rev?.approved_by_ch_id ?? '-'),

      // ใช้ created_at/updated_at ของ revision จะตรงกับการแก้ไขเป็น revision ใหม่
      createdAt: String(rev?.created_at ?? x?.created_at ?? '').slice(0, 10),
      updatedAt: String(rev?.updated_at ?? x?.updated_at ?? '').slice(0, 10),
      feeSheetType: 'transportation',
    };
  }

  /** TAB SWITCH */
  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    this.closeFilterPanel();
    this.applyFilters();
  }

  /** FILTER SYSTEM */
  onFilterChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectTypeFilter = '';
    this.applyFilters();
  }

  applyFilters(resetPageOrFilters: boolean | PurchaseFormsFilterValues = true): void {
    const filters = typeof resetPageOrFilters === 'object' ? resetPageOrFilters : undefined;
    const resetPage = typeof resetPageOrFilters === 'boolean' ? resetPageOrFilters : true;
    if (filters) {
      this.searchTerm = filters.searchTerm || '';
      this.statusFilter = filters.statusFilter || '';
      this.projectTypeFilter = filters.thirdFilter || '';
    }

    const userCode = getCurrentUserCode();
    const base = this.dataSource.filter((item) => {
      if (this.currentTab === 'my') return this.isMyRequest(item, userCode);
      if (this.currentTab === 'pending') return this.isPendingItem(item) && this.isRelatedToCurrentUser(item, userCode);
      if (this.currentTab === 'action') return this.isActionItem(item) && this.isCurrentApprover(item, userCode);
      return true;
    });

    this.filteredData = base.filter(item => {
      const text = this.searchTerm.toLowerCase().trim();

      const matchesSearch =
        !text ||
        item.projectName.toLowerCase().includes(text) ||
        item.projectNo.toLowerCase().includes(text) ||
        item.projectPNo.toLowerCase().includes(text) ||
        this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(text);

      const matchesStatus =
        !this.statusFilter || String(item.status) === this.statusFilter;

      const matchesType =
        !this.projectTypeFilter || item.projectType === this.projectTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });

    if (resetPage) this.pageIndex = 0;

    if (filters) {
      this.closeFilterPanel();
    }
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
    return [this.searchTerm, this.statusFilter, this.projectTypeFilter]
      .filter((value) => !!value).length;
  }

  get visibleRows(): ProjectTransportationFeeSheet[] {
    return this.currentTab === 'action'
      ? this.filteredData
      : this.displayedFilteredDataSource;
  }

  get filteredCount(): number {
    return this.filteredData.length;
  }

  get actionRequestTotal(): number {
    return this.getActionRequestCount();
  }

  getListTitle(): string {
    switch (this.currentTab) {
      case 'all':
        return 'All Transportation Project Fee Sheets';
      case 'my':
        return 'My Transportation Project Fee Sheets';
      case 'pending':
        return 'Pending Transportation Project Fee Sheets';
      case 'action':
        return 'Action Requests';
      default:
        return 'Transportation Project Fee Sheets';
    }
  }

  getActionStepText(): string {
    return 'Approval Review';
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.applyFilters();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.applyFilters();
  }

  onProjectTypeFilterChange(value: string): void {
    this.projectTypeFilter = value || '';
    this.applyFilters();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadFeeSheets(this.pageIndex + 1);
  }

  /** Options */
  getStatusOptions(): string[] {
    return ['draft', 'submitted', 'approved', 'rejected'];
  }

  // ✅ ดึง project type จากข้อมูลจริง ไม่ต้อง hardcode
  getProjectTypeOptions(): string[] {
    const types = this.dataSource.map(x => x.projectType).filter(Boolean);
    return Array.from(new Set(types)).sort();
  }

  updateFilterConfigFrom(items: ProjectTransportationFeeSheet[]): void {
    const projectTypes = Array.from(new Set(items.map((x) => x.projectType).filter(Boolean))).sort() as string[];
    this.filterConfig.thirdFilterOptions = projectTypes.map((type) => ({ value: type, label: type }));
  }

  private isActionItem(item: ProjectTransportationFeeSheet): boolean {
    return String(item.status) === 'submitted';
  }

  private isPendingItem(item: ProjectTransportationFeeSheet): boolean {
    return ['draft', 'submitted', 'proposal_reviewed', 'contract_reviewed'].includes(String(item.status));
  }

  private isMyRequest(item: ProjectTransportationFeeSheet, userCode: string | null): boolean {
    return isMyRequestByUserCode({ ...item, filled_in_by: item.filledInBy, form_filled_by_id: item.filledInBy }, userCode);
  }

  private isRelatedToCurrentUser(item: ProjectTransportationFeeSheet, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();
    return [item.filledInBy, item.approvedBy].some((value) => String(value ?? '').trim().toLowerCase() === target);
  }

  private isCurrentApprover(item: ProjectTransportationFeeSheet, userCode: string | null): boolean {
    if (!userCode) return false;
    return String(item.approvedBy ?? '').trim().toLowerCase() === userCode.trim().toLowerCase();
  }

  getActionRequestCount(): number {
    const userCode = getCurrentUserCode();
    return this.dataSource.filter((item) => this.isActionItem(item) && this.isCurrentApprover(item, userCode)).length;
  }

  /** CRUD */
  onCreateNew(): void {
    this.router.navigate(['/project-transportation-fee-sheet/new']);
  }

  onReview(id: string): void {
    this.router.navigate(['/project-transportation-fee-sheet/action', id, 'approved_by_ch_status']);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  onView(id: string): void {
    this.router.navigate(['/project-transportation-fee-sheet/view', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/project-transportation-fee-sheet/edit', id]);
  }

  onAddRevision(id: string): void {
    this.router.navigate(['/project-transportation-fee-sheet/edit', id], {
      queryParams: { mode: 'revision' },
    });
  }

  canEditCurrent(status: unknown): boolean {
    return canEditCurrentFeeSheet(status);
  }

  canCreateRevision(status: unknown): boolean {
    return canCreateFeeSheetRevision(status);
  }

  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete Transportation Fee Sheet',
      message: 'Are you sure you want to delete this transportation fee sheet? This action cannot be undone!',
      icon: { show: true, name: 'heroicons_outline:exclamation-triangle', color: 'warn' },
      actions: {
        confirm: { show: true, label: 'Delete', color: 'warn' },
        cancel: { show: true, label: 'Cancel' },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result !== 'confirmed') return;

      this.isLoading = true;
      this.feeSheetService.deleteById(id).subscribe({
        next: () => {
          // ลบออกจากตารางทันที
          this.dataSource = this.dataSource.filter((item) => item.id !== id);

          this.actionRequestCount = this.getActionRequestCount();

          this.applyFilters();

          this.isLoading = false;
          this.showAlert('success', 'Transportation fee sheet deleted successfully!');
        },
        error: (err) => {
          this.isLoading = false;
          this.showAlert('error', err?.error?.message ?? err?.message ?? 'Delete failed');
        }
      });
    });
  }

  /** Helpers */
  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  getStatusBadgeClass(status: string): string {
    return {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800'
    }[String(status)] ?? 'bg-gray-100 text-gray-800';
  }

  getStatusLabel(status: string): string {
    return {
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      rejected: 'Rejected'
    }[String(status)] ?? String(status);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0
    }).format(amount || 0);
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }

  formatDateTime(dateString: string): string {
    return formatDateTimeDisplay(dateString);
  }
  onListSortChange(event: ListSortEvent): void {
    this.listSort = event;
    this.pageIndex = 0;
    this.loadFeeSheets(1);
  }
}
