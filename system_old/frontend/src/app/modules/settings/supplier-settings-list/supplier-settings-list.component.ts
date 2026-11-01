import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { environment } from 'environments/environment';
import { CreateSupplierRequest, SuppliersService } from 'app/core/services/suppliers.service';
import { SupplierType, SupplierTypeService } from 'app/core/services/supplier-type.service';
import { fetchAllPagedRows } from 'app/core/utils/paged-export.util';
import { firstValueFrom } from 'rxjs';
import { ListSortEvent, ListTableSortModule } from 'app/shared/list-table-sort/list-table-sort.module';

/** ===== UI model ===== */
export interface SupplierItem {
  id: number;
  supplier_type: string;
  supplier_name: string;
  status: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  No?: number;
}

/** ===== API models: /api/suppliers_page ===== */
interface ApiSupplierRow {
  id: number;
  type: string;
  name: string;
  status: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  create_by?: string | null;
  update_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  No?: number;
}

interface SuppliersPageApiResponse {
  code: string;
  status: boolean;
  message: string;
  data: {
    current_page: number;
    data: ApiSupplierRow[];
    per_page: number;
    total: number;
  };
}

interface SupplierImportRow {
  rowNumber: number;
  type: string;
  name: string;
}

@Component({
  selector: 'app-supplier-settings-list',
  standalone: true,
  imports: [
        ListTableSortModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTooltipModule,
    MatSnackBarModule,
    FuseAlertComponent,
  ],
  templateUrl: './supplier-settings-list.component.html',
  styleUrls: ['./supplier-settings-list.component.scss'],
})
export class SupplierSettingsListComponent implements OnInit {
    listSort: ListSortEvent = { column: 0, dir: 'asc' };
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /** ✅ บังคับใช้ API จริง โดยไม่แตะ environment.ts */
  private readonly forceRealApi = true;

  /** ถ้า HTML มีป้าย mock จะอิงตัวนี้ได้ */
  readonly isMock = !this.forceRealApi && environment.mockApi;

  displayedColumns: string[] = [
    'No',
    'supplier_type',
    'supplier_name',
    'status',
    'address',
    'phone',
    'email',
    'contact_person',
    'created_at',
    'action',
  ];

  items: SupplierItem[] = [];
  isLoading = false;
  isImporting = false;
  isExporting = false;
  importProgress = 0;
  importTotal = 0;

  pageIndex = 0;
  pageSize = 10;
  totalRecords = 0;
  searchTerm = '';

  alert: { type: FuseAlertType; message: string } | null = null;

  private draw = 1;

  constructor(
    private router: Router,
    private http: HttpClient,
    private suppliersService: SuppliersService,
    private supplierTypeService: SupplierTypeService,
    private fuseConfirmationService: FuseConfirmationService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.isLoading = true;

    // ✅ ถ้าตั้งใจให้ใช้ mock จริง ๆ (คุณสามารถปิด forceRealApi แล้วค่อยใช้)
    if (!this.forceRealApi && environment.mockApi) {
      this.items = [];
      this.totalRecords = 0;
      this.isLoading = false;
      return;
    }

    const url = `${environment.apiUrl}/api/suppliers_page`;

    const body = this.buildSuppliersPageBody(this.pageIndex * this.pageSize, this.pageSize);

    this.http.post<SuppliersPageApiResponse>(url, body).subscribe({
      next: (res) => {
        if (!res?.status) {
          this.items = [];
          this.totalRecords = 0;
          this.isLoading = false;
          this.showAlert('error', res?.message ?? 'โหลดข้อมูลไม่สำเร็จ');
          return;
        }

        const rows: ApiSupplierRow[] = Array.isArray(res?.data?.data) ? res.data.data : [];
        this.totalRecords = typeof res?.data?.total === 'number' ? res.data.total : rows.length;

        const startNo = this.pageIndex * this.pageSize;

        this.items = rows.map((r, i) => ({
          id: r.id,
          No: r.No ?? (startNo + i + 1),
          supplier_type: r.type,
          supplier_name: r.name,
          status: r.status,
          address: r.address ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          contact_person: r.contact_person ?? null,
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
        }));

        this.items = [...this.items];
        this.isLoading = false;
      },
      error: (err) => {
        console.error('SUPPLIERS_PAGE ERROR =', err);
        this.items = [];
        this.totalRecords = 0;
        this.isLoading = false;
        this.showAlert('error', 'โหลดข้อมูล Suppliers ไม่สำเร็จ');
      },
    });
  }

  private buildSuppliersPageBody(start: number, length: number): {
    draw: number;
    type: string;
    columns: Array<{ data: string }>;
    order: Array<{ column: number; dir: 'asc' | 'desc' }>;
    start: number;
    length: number;
    search: { value: string; regex: boolean };
  } {
    return {
      draw: this.draw++,
      type: 'deposit', // ถ้าอยากให้โชว์ทุก type ให้ลบ/ส่งเป็น '' (แต่ขึ้นกับ backend)
      columns: [
        { data: 'No' },
        { data: 'name' },
        { data: 'create_by' },
        { data: 'update_by' },
        { data: 'created_at' },
        { data: 'updated_at' },
        { data: 'action' },
      ],
      order: [this.listSort],
      start,
      length,
      search: { value: this.searchTerm ?? '', regex: false },
    };
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadItems();
  }

  onSearch(): void {
    this.pageIndex = 0;
    this.loadItems();
  }

  clearSearch(): void {
    if (!this.searchTerm) return;
    this.searchTerm = '';
    this.pageIndex = 0;
    this.loadItems();
  }

  get importProgressPercent(): number {
    if (!this.importTotal) return 0;
    return Math.round((this.importProgress / this.importTotal) * 100);
  }

  async onExportExcel(): Promise<void> {
    if (this.isExporting) return;

    this.isExporting = true;

    try {
      const rows = await this.loadSuppliersForExport();

      if (rows.length === 0) {
        this.showAlert('info', 'No suppliers available to export.');
        this.snackBar.open('No suppliers available to export.', 'Close', { duration: 3000 });
        return;
      }

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(
        rows.map((row, index) => ({
          '#': row.No ?? index + 1,
          'Supplier Type': row.type || '',
          'Supplier Name': row.name || '',
          Status: row.status || '',
          Address: row.address || '',
          Phone: row.phone || '',
          Email: row.email || '',
          'Contact Person': row.contact_person || '',
          'Created At': row.created_at || '',
          'Updated At': row.updated_at || '',
        }))
      );

      worksheet['!cols'] = [
        { wch: 8 },
        { wch: 28 },
        { wch: 42 },
        { wch: 14 },
        { wch: 42 },
        { wch: 18 },
        { wch: 28 },
        { wch: 24 },
        { wch: 26 },
        { wch: 26 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers');
      XLSX.writeFile(workbook, `supplier-list-${this.getExcelTimestamp()}.xlsx`);

      const message = `Exported ${rows.length} suppliers.`;
      this.showAlert('success', message);
      this.snackBar.open(message, 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Supplier export failed:', error);
      const message = error instanceof Error ? error.message : 'Export failed. Please try again.';
      this.showAlert('error', message);
      this.snackBar.open(message, 'Close', { duration: 5000 });
    } finally {
      this.isExporting = false;
    }
  }

  private async loadSuppliersForExport(): Promise<ApiSupplierRow[]> {
    const url = `${environment.apiUrl}/api/suppliers_page`;
    return fetchAllPagedRows<ApiSupplierRow>(async (start, length) => {
      const response = await firstValueFrom(
        this.http.post<SuppliersPageApiResponse>(
          url,
          this.buildSuppliersPageBody(start, length)
        )
      );

      if (!response?.status) {
        throw new Error(response?.message || 'Unable to load suppliers for export.');
      }

      return response.data;
    });
  }

  private getExcelTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, '');
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) return;

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      this.showAlert('error', 'Please select an Excel file (.xlsx or .xls).');
      return;
    }

    this.isImporting = true;
    this.importProgress = 0;
    this.importTotal = 0;

    try {
      const supplierTypes = await firstValueFrom(this.supplierTypeService.getAll());
      const rows = this.normalizeSupplierImportRows(
        await this.parseSupplierExcel(file),
        supplierTypes
      );

      if (rows.length === 0) {
        this.showAlert('error', 'No supplier rows found. The file must contain Category and Supplier columns.');
        return;
      }

      await this.importSuppliers(rows);
    } catch (error) {
      console.error('Supplier import failed:', error);
      const message = error instanceof Error ? error.message : 'Import failed. Please check the Excel file.';
      this.showAlert('error', message);
      this.snackBar.open(message, 'Close', { duration: 5000 });
    } finally {
      this.isImporting = false;
      this.importProgress = 0;
      this.importTotal = 0;
    }
  }

  private async parseSupplierExcel(file: File): Promise<SupplierImportRow[]> {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase().includes('approved')) ??
      workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('Excel file has no sheets.');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    });

    const headerRowIndex = rows.findIndex((row) => {
      const headers = row.map((cell) => this.normalizeExcelHeader(cell));
      return headers.includes('category') && headers.includes('supplier');
    });

    if (headerRowIndex === -1) {
      throw new Error('Cannot find Category and Supplier headers in the Excel file.');
    }

    const headers = rows[headerRowIndex].map((cell) => this.normalizeExcelHeader(cell));
    const categoryIndex = headers.indexOf('category');
    const supplierIndex = headers.indexOf('supplier');
    const uniqueRows = new Map<string, SupplierImportRow>();

    for (let index = headerRowIndex + 1; index < rows.length; index++) {
      const row = rows[index];
      const type = this.cleanExcelText(row[categoryIndex]);
      const name = this.cleanExcelText(row[supplierIndex]);

      if (!type && !name) continue;
      if (!type || !name) continue;

      const key = this.buildSupplierNameKey(name);
      if (!uniqueRows.has(key)) {
        uniqueRows.set(key, {
          rowNumber: index + 1,
          type,
          name,
        });
      }
    }

    return Array.from(uniqueRows.values());
  }

  private async importSuppliers(rows: SupplierImportRow[]): Promise<void> {
    const existingSuppliers = await firstValueFrom(this.suppliersService.getAllSuppliers());
    const existingByName = new Map(
      existingSuppliers.map((supplier) => [this.buildSupplierNameKey(supplier.name), supplier])
    );
    const rowsToCreate = rows.filter((row) => !existingByName.has(this.buildSupplierNameKey(row.name)));
    const rowsToUpdate = rows.filter((row) => {
      const existing = existingByName.get(this.buildSupplierNameKey(row.name));
      return !!existing && this.cleanExcelText(existing.type) !== this.cleanExcelText(row.type);
    });
    const skippedExisting = rows.length - rowsToCreate.length - rowsToUpdate.length;

    if (rowsToCreate.length === 0 && rowsToUpdate.length === 0) {
      const message = `No new suppliers imported. ${skippedExisting} suppliers already exist with the correct type.`;
      this.showAlert('info', message);
      this.snackBar.open(message, 'Close', { duration: 5000 });
      return;
    }

    this.importTotal = rowsToCreate.length + rowsToUpdate.length;
    let imported = 0;
    let updated = 0;
    const failed: string[] = [];

    for (const row of rowsToUpdate) {
      const existing = existingByName.get(this.buildSupplierNameKey(row.name));
      if (!existing) continue;

      const payload: CreateSupplierRequest = {
        type: row.type,
        name: existing.name || row.name,
        status: existing.status || 'Active',
        address: existing.address ?? null,
        phone: existing.phone ?? null,
        email: existing.email ?? null,
        contact_person: existing.contact_person ?? null,
      };

      try {
        await firstValueFrom(this.suppliersService.update(existing.id, payload));
        updated++;
        existing.type = row.type;
      } catch (error) {
        console.error(`Failed to update supplier row ${row.rowNumber}:`, error);
        failed.push(`${row.rowNumber}: ${row.name}`);
      } finally {
        this.importProgress++;
      }
    }

    for (const row of rowsToCreate) {
      const payload: CreateSupplierRequest = {
        type: row.type,
        name: row.name,
        status: 'Active',
        address: null,
        phone: null,
        email: null,
        contact_person: null,
      };

      try {
        await firstValueFrom(this.suppliersService.create(payload));
        imported++;
        existingByName.set(this.buildSupplierNameKey(row.name), {
          id: 0,
          type: row.type,
          name: row.name,
          status: 'Active',
        });
      } catch (error) {
        console.error(`Failed to import supplier row ${row.rowNumber}:`, error);
        failed.push(`${row.rowNumber}: ${row.name}`);
      } finally {
        this.importProgress++;
      }
    }

    this.pageIndex = 0;
    this.loadItems();

    const skippedText = skippedExisting ? `, skipped ${skippedExisting} existing` : '';
    const updatedText = updated ? `, updated ${updated} existing` : '';
    const failedText = failed.length ? `, failed ${failed.length}` : '';
    const message = `Imported ${imported} suppliers${updatedText}${skippedText}${failedText}.`;
    this.showAlert(failed.length ? 'warning' : 'success', message);
    this.snackBar.open(message, 'Close', { duration: 6000 });
  }

  private normalizeSupplierImportRows(
    rows: SupplierImportRow[],
    supplierTypes: SupplierType[]
  ): SupplierImportRow[] {
    const activeTypes = supplierTypes.filter((type) => Number(type.is_active ?? 1) === 1);

    return rows.map((row) => ({
      ...row,
      type: this.resolveSupplierTypeName(row.type, activeTypes),
    }));
  }

  private resolveSupplierTypeName(rawType: string, supplierTypes: SupplierType[]): string {
    const withoutNumber = this.stripCategoryNumber(rawType);
    const normalizedWithoutNumber = this.normalizeSupplierType(withoutNumber);
    const matchedType = supplierTypes.find(
      (type) => this.normalizeSupplierType(type.name) === normalizedWithoutNumber
    );

    return matchedType?.name || withoutNumber || rawType;
  }

  private stripCategoryNumber(value: string): string {
    return this.cleanExcelText(value).replace(/^\d+\s*[\).:-]\s*/, '').trim();
  }

  private normalizeSupplierType(value: unknown): string {
    return this.stripCategoryNumber(this.cleanExcelText(value)).toLowerCase();
  }

  private cleanExcelText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  private normalizeExcelHeader(value: unknown): string {
    return this.cleanExcelText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private buildSupplierNameKey(name: unknown): string {
    return this.cleanExcelText(name).toLowerCase();
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
    this.router.navigate(['/settings/suppliers/new']);
  }

  onEdit(item: SupplierItem): void {
    if (!item?.id) return;
    this.router.navigate(['/settings/suppliers/edit', item.id]);
  }

  onDelete(item: SupplierItem): void {
    if (!item?.id) return;

    const confirmation = this.fuseConfirmationService.open({
      title: 'Delete Supplier',
      message: `Are you sure you want to delete "${item.supplier_name}"? This action cannot be undone!`,
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
        this.suppliersService.delete(item.id).subscribe({
          next: () => {
            this.showAlert('success', 'Supplier deleted successfully');
            this.snackBar.open('Supplier deleted successfully', 'Close', {
              duration: 3000,
            });
            this.loadItems();
          },
          error: (error) => {
            console.error('Error deleting supplier:', error);
            const errorMessage = error?.error?.message || 'Failed to delete supplier. Please try again.';
            this.showAlert('error', errorMessage);
            this.snackBar.open(errorMessage, 'Close', {
              duration: 3000,
            });
          },
        });
      }
    });
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => (this.alert = null), 4000);
  }
    onListSortChange(event: ListSortEvent): void {
        this.listSort = event;
        this.pageIndex = 0;
        this.loadItems();
    }
}
