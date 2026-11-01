import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from 'environments/environment';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { SupplierTypeService } from 'app/core/services/supplier-type.service';
import { Observable, Subject, map, startWith, takeUntil } from 'rxjs';

@Component({
  selector: 'app-supplier-settings-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    FuseAlertComponent,
  ],
  templateUrl: './supplier-settings-form.component.html',
  styleUrls: ['./supplier-settings-form.component.scss'],
})
export class SupplierSettingsFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  typeOptions: string[] = [];
  filteredTypeOptions: Observable<string[]>;

  // Status options
  statusOptions = ['Active', 'Inactive'];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private supplierTypeService: SupplierTypeService,
  ) {
    this.form = this.fb.group({
      supplier_type: ['', [Validators.required]],
      supplier_name: ['', [Validators.required]],
      status: ['Active', [Validators.required]],
      address: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      contact_person: ['', [Validators.required]],
    });

    const id = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!id;

    this.filteredTypeOptions = this.form.get('supplier_type')!.valueChanges.pipe(
      startWith(''),
      map((value: string | null) => {
        if (!value) return this.typeOptions.slice();
        const filterValue = value.toLowerCase();
        return this.typeOptions.filter((option) => option.toLowerCase().includes(filterValue));
      }),
      takeUntil(this._unsubscribeAll),
    );
  }

  ngOnInit(): void {
    this.loadSupplierTypes();

    if (this.isEditMode) {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.loadSupplier(id);
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private loadSupplier(id: string): void {
    // ✅ API จริง: /api/suppliers/{id}
    const apiUrl = `${environment.apiUrl}/api/suppliers/${id}`;

    this.http.get(apiUrl).subscribe({
      next: (response: any) => {
        // รองรับรูปแบบ: {status:true,data:{...}} หรือ {status:true,data:{data:{...}}}
        const data = response?.data?.data ?? response?.data ?? null;
        if (!data) return;

        this.form.patchValue({
          // ✅ ให้ตรงกับ response จริงที่มี type / name
          supplier_type: data.type || '',
          supplier_name: data.name || '',
          status: data.status || 'Active',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          contact_person: data.contact_person || '',
        });
      },
      error: (error) => {
        console.error('Error loading supplier:', error);
      },
    });
  }

  displayTypeFn(value: string): string {
    return value || '';
  }

  private loadSupplierTypes(): void {
    this.supplierTypeService.getAll().subscribe({
      next: (items) => {
        this.typeOptions = items
          .filter((item) => Number(item.is_active ?? 1) === 1)
          .map((item) => item.name);

        const currentValue = this.form.get('supplier_type')?.value || '';
        this.form.get('supplier_type')?.setValue(currentValue, { emitEvent: true });
      },
      error: (error) => {
        console.error('Error loading supplier types:', error);
        this.typeOptions = [];
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    // ✅ API จริง: /api/suppliers
    const apiUrl = `${environment.apiUrl}/api/suppliers`;

    // ✅ map field ให้ตรง backend: type / name
    const payload = {
      type: this.form.value.supplier_type,
      name: this.form.value.supplier_name,
      status: this.form.value.status,
      address: this.form.value.address,
      phone: this.form.value.phone,
      email: this.form.value.email,
      contact_person: this.form.value.contact_person,
    };



    if (this.isEditMode) {
      const id = this.route.snapshot.paramMap.get('id');

      this.http.patch(`${apiUrl}/${id}`, payload).subscribe({
        next: (response) => {
          this.showAlert('success', 'Supplier updated successfully');
          setTimeout(() => {
            this.isSubmitting = false;
            this.router.navigate(['/settings/suppliers']);
          }, 800);
        },
        error: (error) => {
          console.error('Error updating Supplier:', error);
          this.isSubmitting = false;
          this.showAlert('error', 'Update failed');
        },
      });
    } else {
      this.http.post(apiUrl, payload).subscribe({
        next: (response) => {
          this.showAlert('success', 'Supplier created successfully');
          setTimeout(() => {
            this.isSubmitting = false;
            this.router.navigate(['/settings/suppliers']);
          }, 800);
        },
        error: (error) => {
          console.error('Error creating Supplier:', error);
          this.isSubmitting = false;
          this.showAlert('error', 'Create failed');
        },
      });
    }
  }

  private showAlert(type: FuseAlertType, message: string): void {
    this.alert = { type, message };
    setTimeout(() => {
      this.alert = null;
    }, 3000);
  }
}
