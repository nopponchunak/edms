import { CommonModule } from '@angular/common';
import { formatDateDisplay, formatDateTimeDisplay } from 'app/core/utils/date-format.util';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import {
  canCreateFeeSheetRevision,
  canEditCurrentFeeSheet,
  FeeSheetRow,
  FeeSheetService,
} from 'app/core/services/fee-sheet.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { PurchaseFormsFilterComponent, PurchaseFormsFilterConfig, PurchaseFormsFilterValues } from 'app/core/components/purchase-forms-filter';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';
import { getCurrentUserCode, isMyRequestByUserCode } from 'app/core/utils/action-request-filter.util';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface ProjectFacadeFeeSheet extends FeeSheetRow {}

@Component({
  selector: 'app-project-facade-fee-sheet-list',
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
  templateUrl: './project-facade-fee-sheet-list.component.html',
  styleUrls: ['./project-facade-fee-sheet-list.component.scss'],
})
export class ProjectFacadeFeeSheetListComponent implements OnInit {
  readonly listSortColumns = ['proposal_number', 'created_at', 'project_name', 'project_number', 'project_type', 'nett_fee', 'filled_in_by', 'status'];
  listSort: ListSortEvent = { column: 0, dir: 'desc' };
  readonly navigationPermissionService = inject(NavigationPermissionService);
  readonly permissionNavId = 'project-facade-fee-sheet';
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

  currentTab: 'all' | 'my' | 'pending' | 'action' = 'all';
  viewMode: 'card' | 'table' = 'table';
  showFilterPanel = false;
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';

  alert: { type: FuseAlertType; message: string } | null = null;
  isLoading = false;

  dataSource: ProjectFacadeFeeSheet[] = [];
  actionDataSource: ProjectFacadeFeeSheet[] = [];
  displayedFilteredDataSource: ProjectFacadeFeeSheet[] = [];

  actionRequestCount = 0;
  actionBaseCount = 0;

  totalRecords = 0;
  pageSize = 25;
  pageIndex = 0;
  employeeLookup = new Map<string, string>();

  filterConfig: PurchaseFormsFilterConfig = {
    searchLabel: 'Search Facade Fee Sheets',
    searchPlaceholder: 'Search by Project Name / No. / Filled In By...',
    statusFilterLabel: 'Filter by Status',
    statusOptions: [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'proposal_reviewed', label: 'Proposal Reviewed' },
      { value: 'contract_reviewed', label: 'Contract Reviewed' },
      { value: 'approved', label: 'Approved' },
      { value: 'declined', label: 'Declined' },
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

  private isActionRequest(status: string): boolean {
    return status === 'submitted';
  }

  loadFeeSheets(): void {
    this.isLoading = true;

    this.feeApi.listByType('facade', this.pageIndex + 1, this.pageSize, this.listSortColumns[this.listSort.column] ?? 'created_at', this.listSort.dir).subscribe({
      next: (res) => {
        const userCode = getCurrentUserCode();
        this.dataSource = (res.items ?? []) as ProjectFacadeFeeSheet[];
        this.actionDataSource = this.dataSource.filter((item) =>
          this.isActionRequest(item.status) && this.isCurrentApprover(item, userCode)
        );
        this.actionRequestCount = this.actionDataSource.length;
        this.actionBaseCount = this.actionDataSource.length;
        this.updateFilterConfigFrom(this.dataSource);

        this.totalRecords = res.total ?? 0;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
        this.showAlert('error', 'Load facade fee sheets failed');
      },
    });
  }

  onTabChange(tab: 'all' | 'my' | 'pending' | 'action'): void {
    if (tab === 'all' && !this.navigationPermissionService.hasViewAllPermissionByNavId(this.permissionNavId)) {
      tab = 'my';
    }
    this.currentTab = tab;
    this.closeFilterPanel();
    this.pageIndex = 0;
    this.applyFilters();
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.projectTypeFilter = '';
    this.pageIndex = 0;
    this.applyFilters();
  }

  applyFilters(filters?: PurchaseFormsFilterValues): void {
    if (filters) {
      this.searchTerm = filters.searchTerm || '';
      this.statusFilter = filters.statusFilter || '';
      this.projectTypeFilter = filters.thirdFilter || '';
      this.pageIndex = 0;
    }

    const userCode = getCurrentUserCode();
    const base = this.dataSource.filter((item) => {
      if (this.currentTab === 'my') return this.isMyRequest(item, userCode);
      if (this.currentTab === 'pending') return this.isPendingItem(item) && this.isRelatedToCurrentUser(item, userCode);
      if (this.currentTab === 'action') return this.isActionRequest(item.status) && this.isCurrentApprover(item, userCode);
      return true;
    });

    let data = [...base];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      data = data.filter(
        (item) =>
        (item.projectName || '').toLowerCase().includes(search) ||
        (item.projectNo || '').toLowerCase().includes(search) ||
          this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(search)
      );
    }

    if (this.statusFilter) {
      data = data.filter((item) => item.status === this.statusFilter);
    }

    if (this.projectTypeFilter) {
      data = data.filter((item) => item.projectType === this.projectTypeFilter);
    }

    this.displayedFilteredDataSource = data;

    const usingClientFilteredCount =
      this.currentTab === 'action' ||
      this.currentTab === 'my' ||
      this.currentTab === 'pending' ||
      !!this.searchTerm ||
      !!this.statusFilter ||
      !!this.projectTypeFilter;
    if (usingClientFilteredCount) {
      this.totalRecords = data.length;
    }

    const maxPageIndex =
      this.totalRecords === 0
        ? 0
        : Math.floor((this.totalRecords - 1) / this.pageSize);
    if (this.pageIndex > maxPageIndex) {
      this.pageIndex = 0;
    }

    if (filters) {
      this.closeFilterPanel();
    }
  }

  get pagedDisplayedFilteredDataSource(): ProjectFacadeFeeSheet[] {
    // Server already paginates results; avoid slicing again on page > 1.
    return this.displayedFilteredDataSource;
  }

  get visibleRows(): ProjectFacadeFeeSheet[] {
    return this.currentTab === 'action'
      ? this.displayedFilteredDataSource
      : this.pagedDisplayedFilteredDataSource;
  }

  get filteredCount(): number {
    return this.displayedFilteredDataSource.length;
  }

  get actionRequestTotal(): number {
    return this.actionCountForCurrentUser;
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

  getListTitle(): string {
    switch (this.currentTab) {
      case 'all':
        return 'All Facade Project Fee Sheets';
      case 'my':
        return 'My Facade Project Fee Sheets';
      case 'pending':
        return 'Pending Facade Project Fee Sheets';
      case 'action':
        return 'Action Requests';
      default:
        return 'Facade Project Fee Sheets';
    }
  }

  getActionStepText(): string {
    return 'Approval Review';
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

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadFeeSheets();
  }

  getStatusOptions(): string[] {
    return [
      'draft',
      'submitted',
      'proposal_reviewed',
      'contract_reviewed',
      'approved',
      'declined',
      'rejected',
    ];
  }

  getStatusLabel(status: string): string {
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
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  }

  getProjectTypeOptions(): string[] {
    const types = this.dataSource
      .map((i) => i.projectType)
      .filter(Boolean) as string[];
    return [...new Set(types)].sort();
  }

  updateFilterConfigFrom(items: ProjectFacadeFeeSheet[]): void {
    const projectTypes = Array.from(new Set(items.map((i) => i.projectType).filter(Boolean))).sort() as string[];
    this.filterConfig.thirdFilterOptions = projectTypes.map((type) => ({ value: type, label: type }));
  }

  private isPendingItem(item: ProjectFacadeFeeSheet): boolean {
    return ['draft', 'submitted', 'proposal_reviewed', 'contract_reviewed'].includes(String(item.status));
  }

  private isMyRequest(item: ProjectFacadeFeeSheet, userCode: string | null): boolean {
    return isMyRequestByUserCode({ ...item, filled_in_by: item.filledInBy, form_filled_by_id: item.filledInBy }, userCode);
  }

  private isRelatedToCurrentUser(item: ProjectFacadeFeeSheet, userCode: string | null): boolean {
    if (!userCode) return false;
    const target = userCode.trim().toLowerCase();
    return [item.filledInBy, item.approvedBy].some((value) => String(value ?? '').trim().toLowerCase() === target);
  }

  private isCurrentApprover(item: ProjectFacadeFeeSheet, userCode: string | null): boolean {
    if (!userCode) return false;
    return String(item.approvedBy ?? '').trim().toLowerCase() === userCode.trim().toLowerCase();
  }

  get actionCountForCurrentUser(): number {
    const userCode = getCurrentUserCode();
    return this.dataSource.filter((item) => this.isActionRequest(item.status) && this.isCurrentApprover(item, userCode)).length;
  }

  onCreateNew(): void {
    this.router.navigate(['/project-facade-fee-sheet/new']);
  }

  onView(id: string): void {
    this.router.navigate(['/project-facade-fee-sheet/view', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/project-facade-fee-sheet/edit', id]);
  }

  onAddRevision(id: string): void {
    this.router.navigate(['/project-facade-fee-sheet/edit', id], {
      queryParams: { mode: 'revision' },
    });
  }

  canEditCurrent(status: unknown): boolean {
    return canEditCurrentFeeSheet(status);
  }

  canCreateRevision(status: unknown): boolean {
    return canCreateFeeSheetRevision(status);
  }

  onReview(id: string): void {
    this.router.navigate(['/project-facade-fee-sheet/action', id, 'approved_by_ch_status']);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  async onDelete(id: string): Promise<void> {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete Facade Fee Sheet',
      message: 'Are you sure you want to delete this facade fee sheet? This action cannot be undone!',
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
      if (result !== 'confirmed') {
        return;
      }

      this.isLoading = true;
      this.feeApi.delete(id).subscribe({
        next: () => {
          this.showAlert('success', 'Facade fee sheet deleted successfully!');
          this.loadFeeSheets();
        },
        error: (err) => {
          console.error(err);
          this.isLoading = false;
          this.showAlert('error', 'Delete facade fee sheet failed');
        },
      });
    });
  }

  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      case 'submitted':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'proposal_reviewed':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'contract_reviewed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'declined':
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
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
