import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FuseAlertComponent, FuseAlertType } from '@fuse/components/alert';
import { Observable, startWith, debounceTime, distinctUntilChanged, switchMap, of, tap } from 'rxjs';
import { CommitteeEmployeeDetail, CommitteesService } from 'app/core/services/committees.service';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { resolveEmployeeDisplayInitial } from 'app/core/utils/employee-display.util';

@Component({
    selector: 'app-committee-settings-form',
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
        FuseAlertComponent,
    ],
    templateUrl: './committee-settings-form.component.html',
    styleUrls: ['./committee-settings-form.component.scss'],
})
export class CommitteeSettingsFormComponent implements OnInit {
    form: FormGroup;
    isSubmitting = false;
    isLoading = false;
    isEditMode = false;
    alert: { type: FuseAlertType; message: string } | null = null;

    employees: EmployeeOption[] = [];
    private committeeEmployeeOptions: EmployeeOption[] = [];
    committeeId: number | null = null;

    /** Per-row filtered options for member autocomplete (searchable dropdown) */
    filteredOptions$: Observable<EmployeeOption[]>[] = [];

    constructor(
        private fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private committeesService: CommitteesService,
        private employeeService: EmployeeService,
    ) {
        this.form = this.fb.group({
            name: ['', [Validators.required]],
            members: this.fb.array([]),
        });

        const id = this.route.snapshot.paramMap.get('id');
        this.isEditMode = !!id;
        this.committeeId = id ? parseInt(id, 10) : null;
    }

    ngOnInit(): void {
        this.loadEmployees();

        if (this.isEditMode && this.committeeId) {
            this.loadCommitteeData();
        } else {
            this.addMember(); // เริ่มต้นให้ 1 แถวสำหรับ create mode
        }
    }

    get membersArray(): FormArray {
        return this.form.get('members') as FormArray;
    }

    /** Display employee as "initial (department), firstname lastname" when selected */
    displayEmployeeFn(value: string): string {
        if (!value || typeof value !== 'string') return '';
        const normalizedValue = value.trim();
        const emp = this.employees.find((e) => e.code === normalizedValue || String(e.employeeId ?? '') === normalizedValue);
        return emp ? emp.displayLabel : value;
    }

    /** Filter employees by code or name for autocomplete - ใช้ API search */
    filterEmployeeOptions(value: string): Observable<EmployeeOption[]> {
        if (!value || typeof value !== 'string') {
            return of(this.employees.slice());
        }
        const term = value.trim();
        if (!term) {
            return of(this.employees.slice());
        }
        // เรียก API search แบบ real-time
        return this.employeeService.getEmployeeOptions(term, 50).pipe(
      tap((options) => {
        // displayWith runs after the control receives the employee code.
        // Keep remote results locally so the selected label resolves immediately.
        this.employees = this.mergeEmployeeOptions(this.employees, options);
      })
    );
    }

    /** Rebuild filtered observables when members array changes */
    private updateFilteredOptions(): void {
        const n = this.membersArray.length;
        this.filteredOptions$ = [];
        for (let i = 0; i < n; i++) {
            const ctrl = this.membersArray.at(i).get('employeeCode');
            if (!ctrl) continue;
            this.filteredOptions$.push(
                ctrl.valueChanges.pipe(
                    startWith(ctrl.value ?? ''),
                    debounceTime(300), // รอ 300ms หลังพิมพ์เสร็จ
                    distinctUntilChanged(), // ไม่เรียกซ้ำถ้าค่าเท่าเดิม
                    switchMap((v: string) => this.filterEmployeeOptions(v))
                )
            );
        }
    }

    private loadEmployees(): void {
        this.employeeService.getEmployeeOptions().subscribe({
            next: (employees) => {
                this.employees = this.mergeEmployeeOptions(employees, this.committeeEmployeeOptions);
                this.updateFilteredOptions();
            },
            error: (error) => {
                console.error('Error loading employees for committee form:', error);
                this.employees = [];
                this.showAlert('error', 'Unable to load employees list');
            },
        });
    }

    private loadCommitteeData(): void {
        if (!this.committeeId) return;

        this.isLoading = true;
        this.committeesService.getById(this.committeeId).subscribe({
            next: (response) => {
                const committee = response.data;
                this.form.patchValue({
                    name: committee.name,
                });

                // Clear existing members
                while (this.membersArray.length !== 0) {
                    this.membersArray.removeAt(0);
                }

                // Add members from API
                if (committee.employees && committee.employees.length > 0) {
                    this.committeeEmployeeOptions = committee.employees.map((employee) => this.mapCommitteeEmployeeToOption(employee));
                    this.employeeService.rememberEmployeeOptions(this.committeeEmployeeOptions);
                    this.employees = this.mergeEmployeeOptions(this.employees, this.committeeEmployeeOptions);

                    committee.employees.forEach((employee) => {
                        this.membersArray.push(
                            this.fb.group({
                                employeeCode: [employee.code, [Validators.required]],
                            })
                        );
                    });
                } else {
                    this.committeeEmployeeOptions = [];
                    this.addMember(); // If no members, add one empty row
                }

                this.updateFilteredOptions();
                this.isLoading = false;
            },
            error: (error) => {
                console.error('Error loading committee data:', error);
                this.showAlert(
                    'error',
                    error?.error?.message || 'Unable to load committee data'
                );
                this.isLoading = false;
            },
        });
    }

    addMember(): void {
        this.membersArray.push(
            this.fb.group({
                employeeCode: [null, [Validators.required]],
            }),
        );
        this.updateFilteredOptions();
    }

    removeMember(index: number): void {
        if (this.membersArray.length <= 1) {
            return;
        }
        this.membersArray.removeAt(index);
        this.updateFilteredOptions();
    }

    submit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSubmitting = true;

        const formValue = this.form.value;
        const employeeCodes = formValue.members
            .map((m: { employeeCode: string }) => m.employeeCode)
            .filter((code: string) => code != null && code !== '');

        const payload = {
            committee_name: formValue.name,
            employee_codes: employeeCodes,
        };

        const request = this.isEditMode && this.committeeId
            ? this.committeesService.update(this.committeeId, payload)
            : this.committeesService.create(payload);

        request.subscribe({
            next: (response) => {
                this.showAlert(
                    'success',
                    this.isEditMode
                        ? 'Committee updated successfully'
                        : 'New Committee created successfully'
                );
                setTimeout(() => {
                    this.router.navigate(['/settings/committees']);
                }, 1000);
            },
            error: (error) => {
                console.error('Error saving committee:', error);
                this.showAlert(
                    'error',
                    error?.error?.message ||
                        (this.isEditMode
                            ? 'Unable to update committee'
                            : 'Unable to create committee')
                );
                this.isSubmitting = false;
            },
        });
    }

    private showAlert(type: FuseAlertType, message: string): void {
        this.alert = { type, message };
        setTimeout(() => {
            this.alert = null;
        }, 3000);
    }

    private mapCommitteeEmployeeToOption(employee: CommitteeEmployeeDetail): EmployeeOption {
        const code = String(employee.code || '').trim();
        const firstName = employee.firstname || '';
        const lastName = employee.lastname || '';
        const name = [firstName, lastName].filter(Boolean).join(' ').trim();
        const initial = resolveEmployeeDisplayInitial(employee);
        const displayLabel = [initial, name].filter(Boolean).join(', ');

        return {
            id: code,
            employeeId: typeof employee.id === 'number' ? employee.id : undefined,
            code,
            initial,
            name,
            firstName,
            lastName,
            email: employee.email || '',
            role: employee.title_name || '',
            department: employee.department_name || '',
            titleCode: '',
            displayLabel: displayLabel || code,
            levelName: employee.level_name || '',
        };
    }

    private mergeEmployeeOptions(...optionGroups: EmployeeOption[][]): EmployeeOption[] {
        const merged: EmployeeOption[] = [];
        const seen = new Set<string>();

        optionGroups.flat().forEach((option) => {
            const key = String(option?.code || option?.id || option?.employeeId || '').trim();
            if (!key || seen.has(key)) {
                return;
            }

            seen.add(key);
            merged.push(option);
        });

        return merged;
    }
}

