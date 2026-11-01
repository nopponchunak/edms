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

// ✅ import service
import {
  canCreateFeeSheetRevision,
  canEditCurrentFeeSheet,
  FeeSheetService,
  FeeSheetRow,
} from '../../../core/services/fee-sheet.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

@Component({
  selector: 'app-project-fee-sheet-list',
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
    FuseAlertComponent,
  ],
  templateUrl: './project-fee-sheet-list.component.html',
  styleUrls: ['./project-fee-sheet-list.component.scss'],
})
export class ProjectFeeSheetListComponent implements OnInit {
  readonly listSortColumns = ['proposal_number', 'created_at', 'project_name', 'project_number', 'project_type', 'nett_fee', 'filled_in_by', 'status'];
  listSort: ListSortEvent = { column: 0, dir: 'desc' };
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'project-fee-sheet';

  displayedColumns: string[] = [
    'projectPNo',
    'createdAt',
    'projectName',
    'projectNo',
    'projectType',
    'nettFee',
    'filledInBy',
    'status',
    'actions',
  ];

  actionDisplayedColumns: string[] = [
    'projectPNo',
    'projectName',
    'nettFee',
    'filledInBy',
    'actionStep',
    'status',
    'action',
  ];

  // ✅ ใช้ type จาก service (ตรงกับตารางอยู่แล้ว)
  dataSource: FeeSheetRow[] = [];
  filteredDataSource: FeeSheetRow[] = [];

  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;

  // Filters
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';

  // Pagination
  totalRecords = 0;
  pageSize = 25; // ✅ แนะนำให้ตรงกับ backend (meta.per_page=25)
  pageIndex = 0;
  employeeLookup = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Fee Sheets',
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

  constructor(
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private feeApi: FeeSheetService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.employeeService.getEmployeeLookupMap().subscribe((lookup) => {
      this.employeeLookup = lookup;
    });
    if (!this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      this.currentTab = 'my';
    }
    this.loadFeeSheets();
  }

  // ✅ โหลดจาก API จริง
  loadFeeSheets(): void {
    this.isLoading = true;

    this.feeApi.listByType('project', this.pageIndex + 1, this.pageSize, this.listSortColumns[this.listSort.column] ?? 'created_at', this.listSort.dir).subscribe({
      next: (res) => {
        this.dataSource = res.items;
        this.filteredDataSource = [...this.dataSource];
        this.updateFilterConfigFrom(this.dataSource);

        // ✅ total มาจาก backend
        this.totalRecords = res.total;

        // ถ้าคุณยังใช้ filter/tab บน frontend
        this.updatePaginationTotals();

        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
        this.showAlert('error', 'Load fee sheets failed');
      },
    });
  }

  // ===== Filters =====
  onFilterChange(): void {
    const term = this.searchTerm.trim().toLowerCase();
    const userCode = getCurrentUserCode();
    this.filteredDataSource = this.dataSource.filter((item) => {
      let matchesTab = true;
      if (this.currentTab === 'my') {
        matchesTab = this.isMyRequest(item, userCode);
      } else if (this.currentTab === 'pending') {
        matchesTab = this.isPendingItem(item) && this.isRelatedToCurrentUser(item, userCode);
      } else if (this.currentTab === 'action') {
        matchesTab = this.isActionItem(item) && this.isCurrentApprover(item, userCode);
      }

      const matchSearch =
        !term ||
        (item.projectName ?? '').toLowerCase().includes(term) ||
        (item.projectNo ?? '').toLowerCase().includes(term) ||
        (item.projectPNo ?? '').toLowerCase().includes(term) ||
        this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(term);

      const matchStatus = !this.statusFilter || item.status === this.statusFilter;
      const matchType = !this.projectTypeFilter || item.projectType === this.projectTypeFilter;

      return matchesTab && matchSearch && matchStatus && matchType;
    });

    // รีเซ็ตหน้า และอัปเดตจำนวนทั้งหมด
    this.pageIndex = 0;
    this.updatePaginationTotals();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectTypeFilter = '';
    this.onFilterChange();
  }

  applyFilters(filters: PurchaseFormsFilterValues): void {
    this.searchTerm = filters.searchTerm || '';
    this.statusFilter = filters.statusFilter || '';
    this.projectTypeFilter = filters.thirdFilter || '';
    this.onFilterChange();
    this.closeFilterPanel();
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

  getStatusOptions(): Array<any> {
    return ['draft', 'submitted', 'approved', 'rejected'];
  }

  getProjectTypeOptions(): string[] {
    const types = this.dataSource
      .map((i) => i.projectType)
      .filter(Boolean) as string[];
    return [...new Set(types)].sort();
  }

  updateFilterConfigFrom(items: FeeSheetRow[]): void {
    const projectTypes = Array.from(new Set(items.map((i) => i.projectType).filter(Boolean))).sort() as string[];
    this.filterConfig.thirdFilterOptions = projectTypes.map((type) => ({ value: type, label: type }));
  }

  getStatusLabel(s: any): string {
    switch (s) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return String(s ?? '');
    }
  }

  getStatusBadgeClass(s: any): string {
    switch (s) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  // Tabs
  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    this.closeFilterPanel();
    this.pageIndex = 0;
    this.onFilterChange();
  }

  private isActionItem(item: FeeSheetRow): boolean {
    return item.status === 'submitted';
  }

  private isPendingItem(item: FeeSheetRow): boolean {
    return ['draft', 'submitted', 'proposal_reviewed', 'contract_reviewed'].includes(String(item.status));
  }

  private isMyRequest(item: FeeSheetRow, userCode: string | null): boolean {
    return isMyRequestByUserCode(
      { ...item, filled_in_by: item.filledInBy, form_filled_by_id: item.filledInBy },
      userCode
    );
  }

  private isRelatedToCurrentUser(item: FeeSheetRow, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();
    return [item.filledInBy, item.approvedBy].some((value) => String(value ?? '').trim().toLowerCase() === target);
  }

  private isCurrentApprover(item: FeeSheetRow, userCode: string | null): boolean {
    if (!userCode) return false;
    return String(item.approvedBy ?? '').trim().toLowerCase() === userCode.trim().toLowerCase();
  }

  get actionBaseCount(): number {
    const userCode = getCurrentUserCode();
    return this.dataSource.filter((i) => this.isActionItem(i) && this.isCurrentApprover(i, userCode)).length;
  }

  // data ตามแท็บ + filter (ยังไม่ slice หน้า)
  get displayedFilteredDataSource(): FeeSheetRow[] {
    return this.filteredDataSource;
  }

  // data ที่ใช้แสดงใน table (slice ตามหน้า)
  get pagedDisplayedDataSource(): FeeSheetRow[] {
    return this.displayedFilteredDataSource;
  }

  get visibleRows(): FeeSheetRow[] {
    return this.currentTab === 'action'
      ? this.displayedFilteredDataSource
      : this.pagedDisplayedDataSource;
  }

  get filteredCount(): number {
    return this.displayedFilteredDataSource.length;
  }

  get actionRequestTotal(): number {
    return this.actionBaseCount;
  }

  getListTitle(): string {
    switch (this.currentTab) {
      case 'all':
        return 'All Project Fee Sheets';
      case 'my':
        return 'My Project Fee Sheets';
      case 'pending':
        return 'Pending Project Fee Sheets';
      case 'action':
        return 'Action Requests';
      default:
        return 'Project Fee Sheets';
    }
  }

  getActionStepText(): string {
    return 'Approval Review';
  }

  // Pagination helpers
  updatePaginationTotals(): void {
    this.totalRecords = this.totalRecords || this.displayedFilteredDataSource.length;
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;

    // ✅ เปลี่ยนหน้า -> โหลดข้อมูลหน้าใหม่จาก API
    this.loadFeeSheets();
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value || '';
    this.onFilterChange();
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter = value || '';
    this.onFilterChange();
  }

  onProjectTypeFilterChange(value: string): void {
    this.projectTypeFilter = value || '';
    this.onFilterChange();
  }

  // Actions
  onCreateNew(): void {
    this.router.navigate(['/project-fee-sheet/new']);
  }

  onView(id: string): void {
    this.router.navigate(['/project-fee-sheet/view', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/project-fee-sheet/edit', id]);
  }

  onAddRevision(id: string): void {
    this.router.navigate(['/project-fee-sheet/edit', id], {
      queryParams: { mode: 'revision' },
    });
  }

  canEditCurrent(status: unknown): boolean {
    return canEditCurrentFeeSheet(status);
  }

  canCreateRevision(status: unknown): boolean {
    return canCreateFeeSheetRevision(status);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete fee sheet',
      message: 'Are you sure you want to remove this fee sheet? This action cannot be undone!',
      icon: {
        show: true,
        name: 'heroicons_outline:exclamation-triangle',
        color: 'warn',
      },
      actions: {
        confirm: {
          show: true,
          label: 'Delete',
          color: 'warn',
        },
        cancel: {
          show: true,
          label: 'Cancel',
        },
      },
      dismissible: false,
    });

    confirmation.afterClosed().subscribe((result) => {
      if (result === 'confirmed') {
        this.isLoading = true;

        this.feeApi.delete(id).subscribe({
          next: () => {
            this.showAlert('success', 'Fee sheet deleted successfully!');
            this.loadFeeSheets();
          },
          error: (err) => {
            console.error(err);
            this.isLoading = false;
            this.showAlert('error', 'Delete fee sheet failed');
          },
        });
      }
    });
  }

  onReview(id: string): void {
    this.router.navigate(['/project-fee-sheet/review', id]);
  }

  // Utils
  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 4000);
  }

  formatCurrency(amount: number, currency: string = 'THB'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
    this.loadFeeSheets();
  }
}
