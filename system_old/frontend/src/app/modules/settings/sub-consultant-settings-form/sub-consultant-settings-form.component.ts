import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { Observable, Subject, map, startWith, takeUntil } from 'rxjs';

import { SubConsultantTypeService } from '../../../core/services/sub-consultant-type.service';
import { SubConsultantService } from '../../../core/services/sub-consultant.service';

@Component({
  selector: 'app-sub-consultant-settings-form',
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
  templateUrl: './sub-consultant-settings-form.component.html',
  styleUrls: ['./sub-consultant-settings-form.component.scss'],
})
export class SubConsultantSettingsFormComponent implements OnInit, OnDestroy {
  form: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  alert: { type: FuseAlertType; message: string } | null = null;

  typeOptions: string[] = [];
  filteredTypeOptions: Observable<string[]>;

  // Status options
  statusOptions = ['Active', 'Inactive'];

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  private id: string | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private subConsultantService: SubConsultantService,
    private subConsultantTypeService: SubConsultantTypeService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      type: ['', [Validators.required]],
      status: ['Active', [Validators.required]],
      address: [''],
      phone: [''],
      email: ['', [Validators.email]],
      contactPerson: [''],
    });

    this.id = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.id;

    this.filteredTypeOptions = this.form.get('type')!.valueChanges.pipe(
      startWith(''),
      map((value: string | null) => {
        if (!value) return this.typeOptions.slice();
        const filterValue = value.toLowerCase();
        return this.typeOptions.filter((option) => option.toLowerCase().includes(filterValue));
      }),
      takeUntil(this._unsubscribeAll)
    );
  }

  ngOnInit(): void {
    this.loadSubConsultantTypes();

    // ✅ ถ้าเป็น edit mode ให้โหลดข้อมูลเดิมมาใส่ฟอร์ม
    if (this.isEditMode && this.id) {
      this.loadDetail(this.id);
    }
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  displayTypeFn(value: string): string {
    return value || '';
  }

  private loadSubConsultantTypes(): void {
    this.subConsultantTypeService.getAll().subscribe({
      next: (items) => {
        this.typeOptions = items
          .filter((item) => Number(item.is_active ?? 1) === 1)
          .map((item) => item.name);

        const currentValue = this.form.get('type')?.value || '';
        this.form.get('type')?.setValue(currentValue, { emitEvent: true });
      },
      error: (error) => {
        console.error('Error loading sub-consultant types:', error);
        this.typeOptions = [];
      },
    });
  }

  private loadDetail(id: string): void {
    this.isSubmitting = true;

    this.subConsultantService.getById(id).subscribe({
      next: (res: any) => {
        // รูปแบบ response อาจเป็น data เป็น object หรือ data.data
        const d = res?.data?.data ?? res?.data ?? res;

        this.form.patchValue({
          name: d?.name ?? '',
          type: d?.type ?? '',
          status: d?.status ?? 'Active',
          address: d?.address ?? '',
          phone: d?.phone ?? '',
          email: d?.email ?? '',
          contactPerson: d?.contact_person ?? d?.contactPerson ?? '',
        });

        this.isSubmitting = false;
      },
      error: (err) => {
        this.isSubmitting = false;
        const msg = err?.error?.message ?? 'โหลดข้อมูลไม่สำเร็จ';
        this.showAlert('error', msg);
      },
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.alert = null;

    // ✅ map field ให้ตรง backend (contact_person)
    const v = this.form.value;
    const payload: any = {
      name: v.name,
      type: v.type,
      status: v.status,
      address: v.address,
      phone: v.phone,
      email: v.email,
      contact_person: v.contactPerson, // ✅ backend ใช้ snake_case
    };

    if (this.isEditMode && this.id) {
      // ✅ UPDATE (แนะนำให้ใช้ PUT)
      this.subConsultantService.update(this.id, payload).subscribe({
        next: (res: any) => {
          this.showAlert('success', res?.message ?? 'แก้ไขสำเร็จ');
          setTimeout(() => {
            this.isSubmitting = false;
            this.router.navigate(['/settings/sub-consultants']);
          }, 500);
        },
        error: (err) => {
          this.isSubmitting = false;
          const msg = err?.error?.message ?? 'แก้ไขไม่สำเร็จ';
          this.showAlert('error', msg);
        },
      });
    } else {
      // ✅ CREATE
      this.subConsultantService.create(payload).subscribe({
        next: (res: any) => {
          this.showAlert('success', res?.message ?? 'เพิ่มสำเร็จ');
          setTimeout(() => {
            this.isSubmitting = false;
            this.router.navigate(['/settings/sub-consultants']);
          }, 500);
        },
        error: (err) => {
          this.isSubmitting = false;
          const msg = err?.error?.message ?? 'เพิ่มไม่สำเร็จ';
          this.showAlert('error', msg);
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
