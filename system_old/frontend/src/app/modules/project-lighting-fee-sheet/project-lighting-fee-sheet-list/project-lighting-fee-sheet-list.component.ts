import { Component, OnInit } from '@angular/core';
import { formatDateDisplay } from 'app/core/utils/date-format.util';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';

// ✅ เปลี่ยน path ให้ตรงของคุณ
import { FeeSheetService, FeeSheetRow } from '../../../core/services/fee-sheet.service';
import { EmployeeService } from 'app/core/services/employee.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

export interface ProjectLightingFeeSheet {
  id: string;
  projectPNo: string;
  projectNo: string;
  projectName: string;
  client: string;
  discipline: string;
  projectType: string;
  grossFee: number;
  nettFee: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | string;
  filledInBy: string;
  approvedBy: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-project-lighting-fee-sheet-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatPaginatorModule,
    FuseAlertComponent,
  ],
  templateUrl: './project-lighting-fee-sheet-list.component.html',
  styleUrls: ['./project-lighting-fee-sheet-list.component.scss'],
})
export class ProjectLightingFeeSheetListComponent implements OnInit {
  readonly listSortColumns = ['proposal_number', 'project_number', 'project_name', 'client_name', 'discipline', 'project_type', 'nett_fee', 'status', 'filled_in_by', 'created_at'];
  listSort: ListSortEvent = { column: 0, dir: 'desc' };

  /** Tabs */
  selectedIndex = 0;
  actionRequestCount = 0;

  /** Filters */
  searchTerm = '';
  statusFilter = '';
  projectTypeFilter = '';

  /** Table */
  displayedColumns: string[] = [
    'projectPNo',
    'projectNo',
    'projectName',
    'client',
    'discipline',
    'projectType',
    'nettFee',
    'status',
    'filledInBy',
    'createdAt',
    'actions',
  ];

  dataSource: ProjectLightingFeeSheet[] = [];
  filteredData: ProjectLightingFeeSheet[] = [];

  /** Pagination (UI) */
  totalRecords = 0;
  pageSize = 10;   // UI อยากได้ 10 ก็ได้ แต่ API ของคุณอาจส่งทีละ 25
  pageIndex = 0;
  employeeLookup = new Map<string, string>();

  get displayedFilteredDataSource(): ProjectLightingFeeSheet[] {
    return this.filteredData;
  }

  isLoading = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  constructor(
    private router: Router,
    private fuseConfirmationService: FuseConfirmationService,
    private feeSheetService: FeeSheetService,
    private employeeService: EmployeeService
  ) {}

  ngOnInit(): void {
    this.employeeService.getEmployeeLookupMap().subscribe((lookup) => {
      this.employeeLookup = lookup;
    });
    this.loadFeeSheets();
  }

  onReview(id: string): void {
    this.router.navigate(['/project-lighting-fee-sheet/review', id]);
  }

  /** ✅ LOAD DATA FROM API */
  loadFeeSheets(): void {
    this.isLoading = true;

    // API page เริ่มที่ 1
    const apiPage = this.pageIndex + 1;

    this.feeSheetService.listByType('lighting', apiPage, this.pageSize, this.listSortColumns[this.listSort.column] ?? 'created_at', this.listSort.dir).subscribe({
      next: (res) => {
        // res.items คือ FeeSheetRow ที่ transform มาแล้ว
        this.dataSource = (res.items as unknown as ProjectLightingFeeSheet[]);

        // Action Request = submitted
        this.actionRequestCount = this.dataSource.filter(x => x.status === 'submitted').length;

        // total จาก API (สำคัญสำหรับ paginator ถ้าทำ server-side จริง)
        this.totalRecords = res.total;

        // apply filter ต่อ
        this.applyFilters(false);

        this.isLoading = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoading = false;
        this.showAlert('error', err?.error?.message ?? 'Load lighting fee sheets failed');
      },
    });
  }

  /** TAB SWITCH */
  onTabChange(index: number): void {
    this.selectedIndex = index;

    // เวลาเปลี่ยนแท็บ รีเซ็ตหน้า
    this.pageIndex = 0;

    // ถ้าอยากให้ Action Request ก็ยิง API ใหม่เหมือนกัน ก็เรียก loadFeeSheets()
    // แต่ตอนนี้เรา filter จาก dataSource เดิมได้เลย
    if (index === 0) {
      this.applyFilters();
    } else {
      this.filteredData = this.getActionRequestData();
      this.resetPaginationLocal();
    }
  }

  /** Return only submitted list */
  getActionRequestData(): ProjectLightingFeeSheet[] {
    return this.dataSource.filter(x => x.status === 'submitted');
  }

  /** FILTER SYSTEM */
  onFilterChange(): void {
    if (this.selectedIndex === 0) {
      this.applyFilters();
    }
  }

  applyFilters(resetPage = true): void {
    const base =
      this.selectedIndex === 1
        ? this.getActionRequestData()
        : this.dataSource;

    this.filteredData = base.filter(item => {
      const text = (this.searchTerm ?? '').toLowerCase().trim();

      const matchesSearch =
        !text ||
        (item.projectName ?? '').toLowerCase().includes(text) ||
        (item.projectNo ?? '').toLowerCase().includes(text) ||
        (item.client ?? '').toLowerCase().includes(text) ||
        this.getEmployeeLabel(item.filledInBy).toLowerCase().includes(text);

      const matchesStatus =
        !this.statusFilter || item.status === this.statusFilter;

      const matchesType =
        !this.projectTypeFilter || item.projectType === this.projectTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });

    // ถ้าคุณทำ client-side pagination จาก filteredData ให้ set totalRecords = filteredData.length
    // แต่ถ้าต้องการให้ paginator แสดง total จาก API จริง ให้คง this.totalRecords = res.total
    // ตอนนี้เลือก: ให้ totalRecords = filteredData.length ในหน้า Forms/Action เพื่อ UI ตรงกับที่เห็น
    if (resetPage) this.resetPaginationLocal();
  }

  private resetPaginationLocal(): void {
    this.pageIndex = 0;
  }

  /** ✅ เมื่อเปลี่ยนหน้า ให้โหลด API ใหม่ */
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;

    // โหลดใหม่จาก API (server-side)
    this.loadFeeSheets();
  }

  /** Options */
  getStatusOptions(): string[] {
    return ['draft', 'submitted', 'approved', 'rejected'];
  }

  getProjectTypeOptions(): string[] {
    // ถ้าจะให้มาจาก API จริง ค่อยทำตอนหลังได้
    return [
      'Commercial-Office',
      'Commercial-General',
      'Residential',
      'Leisure/Recreation/Tourism',
    ];
  }

  /** NAVIGATION */
  onCreateNew(): void {
    this.router.navigate(['/project-lighting-fee-sheet/new']);
  }

  onView(id: string): void {
    this.router.navigate(['/project-lighting-fee-sheet/view', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/project-lighting-fee-sheet/edit', id]);
  }

  getEmployeeLabel(ref: string | number | null | undefined): string {
    return this.employeeService.formatEmployeeReference(ref, this.employeeLookup, 'N/A');
  }

  /** ✅ DELETE (เลือกได้ 2 แบบ: ลบเฉพาะหน้าจอ หรือยิง API แล้วค่อย refresh) */
  onDelete(id: string): void {
    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete lighting fee sheet',
      message: 'Are you sure you want to delete this lighting fee sheet? This action cannot be undone!',
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
      if (result !== 'confirmed') return;

      // ✅ แบบที่ 1: ยิง API ลบจริง
      this.feeSheetService.deleteById(id).subscribe({
        next: () => {
          this.showAlert('success', 'Lighting fee sheet deleted successfully!');
          this.loadFeeSheets(); // refresh list
        },
        error: (err) => {
          console.error(err);
          this.showAlert('error', err?.error?.message ?? 'Delete failed');
        },
      });

      // ✅ แบบที่ 2: ถ้าจะลบแค่หน้า UI (ไม่ยิง API) ให้ใช้โค้ดนี้แทน
      // this.dataSource = this.dataSource.filter(item => item.id !== id);
      // this.actionRequestCount = this.dataSource.filter(x => x.status === 'submitted').length;
      // this.applyFilters();
      // this.showAlert('success', 'Lighting fee sheet deleted successfully!');
    });
  }

  /** HELPERS */
  showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 5000);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    return ({
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      rejected: 'Rejected',
    } as any)[status] ?? status;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 0,
    }).format(amount ?? 0);
  }

  formatDate(dateString: string): string {
    return formatDateDisplay(dateString);
  }
  onListSortChange(event: ListSortEvent): void {
    this.listSort = event;
    this.pageIndex = 0;
    this.loadFeeSheets();
  }
}
