import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';

import { BehaviorSubject, Subject, combineLatest, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { SubConsultantService } from '../../../core/services/sub-consultant.service';
import type { SubConsultantItem } from '../../../core/services/sub-consultant.service';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

type ListState = {
  pageIndex: number; // 0-based
  pageSize: number;
  search: string;    // global search (name/type)
  type: string;      // deposit
  status: string;    // Active/Inactive/'' (All)
};

@Component({
  selector: 'app-sub-consultant-settings-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    FuseAlertComponent,
  ],
  templateUrl: './sub-consultant-settings-list.component.html',
  styleUrls: ['./sub-consultant-settings-list.component.scss'],
})
export class SubConsultantSettingsListComponent implements OnInit, OnDestroy {
  listSort: ListSortEvent = { column: 0, dir: 'asc' };
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  displayedColumns: string[] = ['No', 'name', 'type', 'status', 'created_at', 'action'];

  items: SubConsultantItem[] = [];
  isLoading = false;

  pageIndex = 0;
  pageSize = 10;
  totalRecords = 0;

  // UI
  searchTerm = '';
  statusFilter = ''; // ''=All, 'Active', 'Inactive'

  alert: { type: FuseAlertType; message: string } | null = null;   

  // ตาม Postman
  type = 'deposit';

  private destroy$ = new Subject<void>();
  private refresh$ = new Subject<void>();
  private searchInput$ = new Subject<string>();
  private draw = 1;

  private state$ = new BehaviorSubject<ListState>({
    pageIndex: 0,
    pageSize: 10,
    search: '',
    type: 'deposit',
    status: '',
  });

  constructor(private router: Router, private subConsultantService: SubConsultantService) {}

  ngOnInit(): void {
    // sync ค่า dropdown จาก state (กันค่า UI ไม่ตรง)
    this.statusFilter = this.state$.value.status ?? '';

    // debounce search สำหรับคำทั่วไป (name/type)
    this.searchInput$
      .pipe(
        debounceTime(400),
        map((v) => (v ?? '').trim()),
        distinctUntilChanged(),
        tap((search) => {
          const s = this.state$.value;
          this.state$.next({ ...s, pageIndex: 0, search });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    // ยิง API
    combineLatest([
      this.state$.pipe(
        distinctUntilChanged(
          (a, b) =>
            a.pageIndex === b.pageIndex &&
            a.pageSize === b.pageSize &&
            a.search === b.search &&
            a.type === b.type &&
            a.status === b.status
        )
      ),
      this.refresh$.pipe(startWith(void 0)),
    ])
      .pipe(
        map(([state]) => state),
        switchMap((state) => {
          this.isLoading = true;
          this.alert = null;

          const page = state.pageIndex + 1; // API 1-based
          const perPage = state.pageSize;

          return this.subConsultantService
            .list({
              page,
              perPage,
              search: state.search,   // global search
              type: state.type,
              status: state.status,   // status filter
              draw: this.draw++,
              order: [this.listSort],
            })
            .pipe(
              catchError((err) => {
                const msg = err?.error?.message ?? err?.message ?? 'โหลดรายการไม่สำเร็จ';
                this.showAlert('error', msg);
                return of({ items: [], total: 0, page, perPage, lastPage: 1 });
              }),
              finalize(() => (this.isLoading = false))
            );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((res) => {
        const page = res.page ?? this.state$.value.pageIndex + 1;
        const perPage = res.perPage ?? this.state$.value.pageSize;
        const startNo = (page - 1) * perPage;

        this.items = (res.items ?? []).map((it, i) => ({
          ...it,
          No: it.No ?? startNo + i + 1,
        }));

        this.totalRecords = res.total ?? 0;

        // sync กลับเข้าหน้า
        this.pageIndex = page - 1;
        this.pageSize = perPage;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * ✅ พิมพ์ในช่อง Search
   * - ถ้าเป็น active/inactive => set เป็น status filter (แต่ "ไม่ล้าง" ช่อง search เพื่อให้ X โชว์)
   * - ถ้าเป็นคำอื่น => debounce เป็น global search
   */
  onSearchInput(value: string): void {
    this.searchTerm = value;

    const raw = (value ?? '').trim();
    const normalized = raw.toLowerCase();

    if (normalized === 'active' || normalized === 'inactive') {
      const nextStatus = normalized === 'active' ? 'Active' : 'Inactive';

      // sync dropdown
      this.statusFilter = nextStatus;

      // ส่งไปกรอง status แทน (ไม่ส่ง global search)
      const s = this.state$.value;
      this.state$.next({
        ...s,
        pageIndex: 0,
        search: '',        // ✅ ไม่ใช้ global search
        status: nextStatus // ✅ ใช้ status filter
      });

      this.refresh$.next();
      return;
    }

    // คำทั่วไป -> global search
    this.searchInput$.next(value);
  }

  onPageChange(event: PageEvent): void {
    const s = this.state$.value;
    this.state$.next({
      ...s,
      pageIndex: event.pageIndex,
      pageSize: event.pageSize,
    });
  }

  onListSortChange(event: ListSortEvent): void {
    this.listSort = event;
    const state = this.state$.value;
    this.state$.next({ ...state, pageIndex: 0 });
    this.refresh$.next();
  }

  /**
   * ✅ กด Enter หรือกดไอคอนแว่น
   * - ถ้า active/inactive => set status filter
   * - ไม่ล้าง searchTerm เพื่อให้ X โชว์
   */
  onSearch(): void {
    const s = this.state$.value;

    const raw = (this.searchTerm ?? '').trim();
    const normalized = raw.toLowerCase();

    if (normalized === 'active' || normalized === 'inactive') {
      const nextStatus = normalized === 'active' ? 'Active' : 'Inactive';

      this.statusFilter = nextStatus;

      this.state$.next({
        ...s,
        pageIndex: 0,
        search: '',
        status: nextStatus,
      });

      this.refresh$.next();
      return;
    }

    // ค้นหาแบบปกติ
    this.state$.next({
      ...s,
      pageIndex: 0,
      search: raw,
    });

    this.refresh$.next();
  }

  /**
   * (ถ้าคุณยังใช้ dropdown status)
   */
  onStatusChange(value: string): void {
    const next = value ?? '';
    this.statusFilter = next;

    // เวลาเลือก status ให้ล้าง global search
    const s = this.state$.value;
    this.state$.next({
      ...s,
      pageIndex: 0,
      search: '',
      status: next,
    });

    this.refresh$.next();
  }

  /**
   * ✅ กด X ที่ Search
   * เคลียร์ทั้ง search + status
   */
  clearSearch(): void {
    this.searchTerm = '';
    this.statusFilter = '';

    const s = this.state$.value;
    this.state$.next({
      ...s,
      pageIndex: 0,
      search: '',
      status: '',
    });

    this.refresh$.next();
  }

  // ถ้าคุณยังมีปุ่ม X ของ status แยก
  clearStatus(): void {
    this.statusFilter = '';
    const s = this.state$.value;
    this.state$.next({
      ...s,
      pageIndex: 0,
      status: '',
    });
    this.refresh$.next();
  }

  refresh(): void {
    this.refresh$.next();
  }

  getStatusBadgeClass(status: string | undefined | null): string {
    if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    const normalized = status.toString().toLowerCase();
    switch (normalized) {
      case 'yes':
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'no':
      case 'inactive':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  onCreate(): void {
    this.router.navigate(['/settings/sub-consultants/new']);
  }

  onEdit(item: SubConsultantItem): void {
    if (!item?.id) return;
    this.router.navigate(['/settings/sub-consultants/edit', item.id]);
  }

  trackById(_index: number, item: SubConsultantItem): number {
    return item.id;
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 4000);
  }
}
