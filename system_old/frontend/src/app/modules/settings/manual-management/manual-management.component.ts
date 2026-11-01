import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
    FormsModule,
    ReactiveFormsModule,
    UntypedFormArray,
    UntypedFormBuilder,
    UntypedFormGroup,
    Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { ManualViewerDialogComponent } from 'app/core/components/page-manual-help/manual-viewer-dialog.component';
import {
    Manual,
    ManualMatchType,
    ManualMenuOption,
    ManualPageMapping,
    ManualService,
    ManualSortColumn,
    ManualSortDirection,
    ManualStatus,
} from 'app/core/services/manual.service';
import { finalize } from 'rxjs';

@Component({
    selector: 'app-manual-management',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatIconModule,
        MatMenuModule,
        MatPaginatorModule,
        MatProgressSpinnerModule,
        MatSortModule,
        MatTableModule,
        MatTooltipModule,
        FuseAlertComponent,
    ],
    templateUrl: './manual-management.component.html',
    styleUrls: ['./manual-management.component.scss'],
})
export class ManualManagementComponent implements OnInit {
    displayedColumns: string[] = [
        'no',
        'title',
        'file',
        'mappings',
        'status',
        'updated_at',
        'action',
    ];
    items: Manual[] = [];
    menuOptions: ManualMenuOption[] = [];
    isLoading = false;
    isSaving = false;
    pageIndex = 0;
    pageSize = 25;
    totalRecords = 0;
    sortActive = 'updated_at';
    sortDirection: ManualSortDirection = 'desc';
    searchTerm = '';
    statusFilter: ManualStatus | 'all' = 'active';
    selectedFile: File | null = null;
    editingManual: Manual | null = null;
    alert: { type: FuseAlertType; message: string } | null = null;

    form = this.fb.group({
        title: ['', Validators.required],
        description: [''],
        status: ['active' as ManualStatus, Validators.required],
        mappings: this.fb.array([]),
    });

    matchTypes: Array<{
        value: ManualMatchType;
        label: string;
        hint: string;
    }> = [
        {
            value: 'exact',
            label: 'Exact',
            hint: 'Only this URL',
        },
        {
            value: 'prefix',
            label: 'Prefix',
            hint: 'This URL and child pages',
        },
        {
            value: 'pattern',
            label: 'Pattern',
            hint: 'Supports dynamic segments',
        },
    ];

    private readonly sortColumnMap: Record<string, ManualSortColumn> = {
        no: 'No',
        title: 'title',
        file: 'original_file_name',
        status: 'status',
        updated_at: 'updated_at',
    };

    constructor(
        private fb: UntypedFormBuilder,
        private dialog: MatDialog,
        private manualService: ManualService
    ) {}

    ngOnInit(): void {
        this.addMapping();
        this.loadMenus();
        this.loadData();
    }

    get mappings(): UntypedFormArray {
        return this.form.get('mappings') as UntypedFormArray;
    }

    get supportedFileTypesLabel(): string {
        return this.manualService.getManualSupportedFileTypesLabel();
    }

    loadData(): void {
        this.isLoading = true;
        this.manualService
            .page({
                page: this.pageIndex + 1,
                perPage: this.pageSize,
                search: this.searchTerm.trim(),
                status: this.statusFilter,
                sortColumn: this.getSortColumn(),
                sortDirection: this.sortDirection,
            })
            .subscribe({
                next: (result) => {
                    this.items = result.items;
                    this.totalRecords = result.total;
                    this.isLoading = false;
                },
                error: (error) => {
                    this.showAlert(
                        'error',
                        error?.error?.message || 'Unable to load manuals'
                    );
                    this.items = [];
                    this.totalRecords = 0;
                    this.isLoading = false;
                },
            });
    }

    loadMenus(): void {
        this.manualService.getMenuOptions().subscribe({
            next: (options) => {
                this.menuOptions = options;
            },
            error: () => {
                this.menuOptions = [];
            },
        });
    }

    onSearch(): void {
        this.pageIndex = 0;
        this.loadData();
    }

    onStatusFilterChange(): void {
        this.pageIndex = 0;
        this.loadData();
    }

    onPageChange(event: PageEvent): void {
        this.pageIndex = event.pageIndex;
        this.pageSize = event.pageSize;
        this.loadData();
    }

    onSortChange(sort: Sort): void {
        if (!this.sortColumnMap[sort.active]) {
            return;
        }

        this.sortActive = sort.active;
        this.sortDirection = sort.direction === 'asc' ? 'asc' : 'desc';
        this.pageIndex = 0;
        this.loadData();
    }

    getRowNo(index: number): number {
        return this.pageIndex * this.pageSize + index + 1;
    }

    addMapping(mapping?: Partial<ManualPageMapping>): void {
        this.mappings.push(this.createMappingGroup(mapping));
    }

    removeMapping(index: number): void {
        if (this.mappings.length === 1) {
            this.mappings.at(0).reset({
                menu_id: null,
                url_path: '',
                match_type: 'exact',
            });
            return;
        }

        this.mappings.removeAt(index);
    }

    onMenuSelected(index: number): void {
        const group = this.mappings.at(index) as UntypedFormGroup;
        const menuId = group.get('menu_id')?.value;
        const option = this.menuOptions.find(
            (item) => Number(item.id) === Number(menuId)
        );

        if (!option?.path) {
            return;
        }

        const currentPath = String(group.get('url_path')?.value ?? '').trim();
        if (!currentPath) {
            group.get('url_path')?.setValue(option.path);
        }
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] ?? null;

        if (!file) {
            this.selectedFile = null;
            return;
        }

        if (!this.manualService.isAllowedManualFile(file)) {
            const supportedTypes =
                this.manualService.getManualSupportedFileTypesLabel();
            this.selectedFile = null;
            input.value = '';
            this.showAlert(
                'error',
                `Only ${supportedTypes} files are supported.`
            );
            return;
        }

        if (!this.manualService.isManualFileSizeValid(file.size)) {
            this.selectedFile = null;
            input.value = '';
            this.showAlert(
                'error',
                this.manualService.getManualFileSizeExceededMessage(file)
            );
            return;
        }

        this.selectedFile = file;
    }

    save(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            this.showAlert('error', 'Please complete the required fields.');
            return;
        }

        if (!this.editingManual && !this.selectedFile) {
            this.showAlert('error', 'Please upload a manual file.');
            return;
        }

        const mappings = this.getCleanMappings();
        if (mappings.length === 0) {
            this.showAlert('error', 'Please add at least one URL path.');
            return;
        }

        const payload = this.manualService.buildManualFormData({
            title: this.form.value.title,
            description: this.form.value.description,
            status: this.form.value.status,
            file: this.selectedFile,
            mappings,
        });

        this.isSaving = true;
        const request$ = this.editingManual
            ? this.manualService.update(this.editingManual.id, payload)
            : this.manualService.create(payload);

        request$.pipe(finalize(() => (this.isSaving = false))).subscribe({
            next: () => {
                this.showAlert(
                    'success',
                    this.editingManual
                        ? 'Manual updated successfully'
                        : 'Manual created successfully'
                );
                this.resetForm();
                this.loadData();
            },
            error: (error) => {
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to save manual'
                );
            },
        });
    }

    edit(item: Manual): void {
        this.editingManual = item;
        this.selectedFile = null;
        this.form.patchValue({
            title: item.title,
            description: item.description ?? '',
            status:
                item.status === 'inactive'
                    ? ('inactive' as ManualStatus)
                    : ('active' as ManualStatus),
        });

        this.mappings.clear();
        const mappings = item.mappings?.length ? item.mappings : [];
        mappings.forEach((mapping) => this.addMapping(mapping));

        if (this.mappings.length === 0) {
            this.addMapping();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    preview(item: Manual): void {
        this.dialog.open(ManualViewerDialogComponent, {
            data: { manuals: [item] },
            width: 'min(1120px, 94vw)',
            maxWidth: '94vw',
            maxHeight: '92vh',
        });
    }

    delete(item: Manual): void {
        if (!confirm(`Delete manual "${item.title}"?`)) {
            return;
        }

        this.isLoading = true;
        this.manualService.delete(item.id).subscribe({
            next: () => {
                this.showAlert('success', 'Manual deleted successfully');
                this.loadData();
            },
            error: (error) => {
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to delete manual'
                );
                this.isLoading = false;
            },
        });
    }

    resetForm(): void {
        this.editingManual = null;
        this.selectedFile = null;
        this.form.reset({
            title: '',
            description: '',
            status: 'active',
        });
        this.mappings.clear();
        this.addMapping();
    }

    getFileSummary(item: Manual): string {
        const name = item.original_file_name || item.file_path || '-';
        const size = this.manualService.formatFileSize(item.file_size);

        return size === '-' ? name : `${name} (${size})`;
    }

    getMappingSummary(item: Manual): string {
        const mappings = item.mappings ?? [];

        if (mappings.length === 0) {
            return '-';
        }

        return mappings
            .slice(0, 3)
            .map((mapping) => mapping.url_path)
            .join(', ');
    }

    getExtraMappingCount(item: Manual): number {
        const count = item.mappings?.length ?? 0;
        return count > 3 ? count - 3 : 0;
    }

    private createMappingGroup(
        mapping?: Partial<ManualPageMapping>
    ): UntypedFormGroup {
        return this.fb.group({
            menu_id: [mapping?.menu_id ?? null],
            url_path: [
                mapping?.url_path
                    ? this.manualService.normalizePath(mapping.url_path)
                    : '',
                Validators.required,
            ],
            match_type: [mapping?.match_type ?? 'exact', Validators.required],
        });
    }

    private getCleanMappings(): ManualPageMapping[] {
        return this.mappings.controls
            .map((control, index) => {
                const value = control.value;
                return {
                    menu_id: value.menu_id ? Number(value.menu_id) : null,
                    url_path: this.manualService.normalizePath(value.url_path),
                    match_type: value.match_type as ManualMatchType,
                    display_order: index + 1,
                    is_active: 1,
                };
            })
            .filter((mapping) => mapping.url_path.trim() !== '');
    }

    private getSortColumn(): ManualSortColumn {
        return this.sortColumnMap[this.sortActive] ?? 'updated_at';
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        window.setTimeout(() => {
            this.alert = null;
        }, 5000);
    }
}
