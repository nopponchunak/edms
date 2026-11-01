import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormArray,
  FormControl
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { FuseUploadDialogComponent } from '@fuse/components/upload-dialog';
import { PurchaseOrderService } from 'app/core/services/purchase-order.service';
import { PurchaseRequisitionService } from 'app/core/services/purchase-requisition.service';
import type { PrForSelectionItem } from 'app/core/services/purchase-requisition.service';
import { AddItemsFromPrDialogComponent } from './add-items-from-pr-dialog.component';
import { NgxMatSelectSearchModule } from 'ngx-mat-select-search';
import { HttpClient } from '@angular/common/http';
import { ApiConfig } from 'app/core/config/api.config';
import { DEFAULT_PURCHASE_PAYMENT_TERM } from 'app/core/constants/purchase-payment-term.constant';
import { EmployeeService, EmployeeOption } from 'app/core/services/employee.service';
import { SuppliersService, SupplierOption } from 'app/core/services/suppliers.service';
import { PURCHASE_ORDER_EMAIL_CONFIG, WorkflowEmailNotificationService } from 'app/core/services/workflow-email-notification.service';
import { getCurrentUserCode } from 'app/core/utils/action-request-filter.util';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs/operators';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';

export interface PurchaseOrderItem {
  item: string;
  description: string;
  needAssetCodeRegistration?: boolean;
  assetCode?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

@Component({
  selector: 'app-purchase-order-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatDatepickerModule,
    MatDialogModule,
    NgxMatSelectSearchModule
  ],
  templateUrl: './purchase-order-form.component.html',
  styleUrls: ['./purchase-order-form.component.scss']
})
export class PurchaseOrderFormComponent implements OnInit, OnDestroy {
  readonly defaultPaymentTerm = DEFAULT_PURCHASE_PAYMENT_TERM;
  private readonly defaultFromLabel = 'Meinhardt (Thailand) Ltd.';

  form: FormGroup;
  isEditMode = false;
  isLoading = false;
  isSubmitting = false;
  isSavingDraft = false;
  suppressValidationErrors = false;
  currentPurchaseOrderId: string | null = null;
  currentDocumentStatus: 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'APPROVED' | 'REJECTED' | 'DELIVERED' | 'COMPLETED' = 'DRAFT';

  users: EmployeeOption[] = [];
  suppliers: SupplierOption[] = [];
  filteredSuppliers: SupplierOption[] = [];

  // ✅ FIX: เก็บพนักงานทั้งหมดที่โหลดมา เพื่อป้องกัน MatSelect ดีดค่าหลุด (Autocomplete dropdown dropout)
  allLoadedEmployees = new Map<string, EmployeeOption>();

  // Filtered users for each select
  filteredPurchaseRequestUsers: EmployeeOption[] = [];
  filteredSparePartVerifiedUsers: EmployeeOption[] = [];
  filteredApprovedUsers: EmployeeOption[] = [];
  filteredSignedUsers: EmployeeOption[] = [];
  filteredAcknowledgedUsers: EmployeeOption[] = [];
  filteredCircUsers: EmployeeOption[] = [];

  // Search controls
  purchaseRequestSearchCtrl = new FormControl('');
  sparePartVerifiedSearchCtrl = new FormControl('');
  approvedSearchCtrl = new FormControl('');
  signedSearchCtrl = new FormControl('');
  acknowledgedSearchCtrl = new FormControl('');
  circSearchCtrl = new FormControl('');

  private _unsubscribeAll: Subject<any> = new Subject<any>();
  private readonly workflowPersonControlNames = [
    'purchaseRequestBy',
    'sparePartVerifiedBy',
    'approvedBy',
    'signedBy',
    'acknowledgedBy',
    'circ'
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private purchaseOrderService: PurchaseOrderService,
    private purchaseRequisitionService: PurchaseRequisitionService,
    private http: HttpClient,
    private apiConfig: ApiConfig,
    private employeeService: EmployeeService,
    private suppliersService: SuppliersService,
    private workflowEmailNotificationService: WorkflowEmailNotificationService,
    private fuseConfirmationService: FuseConfirmationService,
    private toastr: ToastrService
  ) {
    this.form = this.createForm();
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadUsers();
    this.loadSuppliers();
    this.checkEditMode();
    this.checkCreateFromRequisition();
  }

  // ✅ FIX: helper กันพังจาก .trim() กับ number/id จาก mat-select
  private toCleanString(v: any): string {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  private normalizeBlankPlaceholder(value: unknown): string {
    const text = this.toCleanString(value);
    return text === '-' ? '' : text;
  }

  private resolvePurchaseRequisitionId(source: any, fallbackId?: string | number | null): string | null {
    const id = source?.id
      ?? source?.purchase_requisition_id
      ?? source?.purchaseRequisitionId
      ?? source?.requisition_id
      ?? source?.requisitionId
      ?? source?.pr_id
      ?? source?.prId
      ?? fallbackId
      ?? null;
    const normalized = this.toCleanString(id);
    return normalized || null;
  }

  private resolvePurchaseRequisitionNo(source: any): string {
    return this.toCleanString(
      source?.pr_no
      ?? source?.prNo
      ?? source?.purchase_requisition_no
      ?? source?.purchaseRequisitionNo
      ?? source?.requisition_no
      ?? source?.requisitionNo
      ?? ''
    );
  }

  private createForm(): FormGroup {
    return this.fb.group({
      // Left card: To, Company, Fax No., From
	      to: ['', Validators.required],
	      subject: [''],

	      company: ['', Validators.required],
      fax: [''],
      from: [this.defaultFromLabel, Validators.required], // Fallback only; new PO is patched to the current user name.
      cc: [''],

      // PO Information
      poNo: [''],
      poDate: [new Date()],
      purchaseRequisitionId: [null],
      purchaseRequisitionNo: [''],
      requisitionDate: [null, Validators.required],
      pageNumber: [1],
      totalPages: [1],
      circ: [''],

      // Items & Currency
      currency: ['THB', Validators.required],
      items: this.fb.array([]),
      discount: [0],
      subTotal: [0],
      vatValue: [0],
      grandTotal: [0],

      // General Information
      vat: [false],
      quotationNo: [''],
      quotationDate: [new Date()],
      deliveryDate: [''],
      paymentTerm: [this.defaultPaymentTerm],
      otherConditions: [''],

      // Approval and Review
      purchaseRequestBy: ['', Validators.required],
      requestDate: [new Date()],
      notSparePartCase: [false],
      sparePartVerifiedBy: [''],
      sparePartDate: [new Date()],
      approvedBy: ['', Validators.required],
      approvedDate: [new Date()],

      // Checklist
      deliveryOnTime: [''],
      meetQualityRequirement: [''],
      meetGuidelines: [''],

      // Documents
      documents: this.fb.group({
        attachments: this.fb.array([])
      }),

      // Comments and Signatures
      signedBy: ['', Validators.required],
      signedDate: [new Date()],
      acknowledgedBy: ['', Validators.required],
      acknowledgedDate: [new Date()],

      // Status
      status: ['DRAFT'],
      createdBy: [''],
      createdAt: [''],
      updatedAt: ['']
    });
  }

  private initializeForm(): void {
    this.addItem();
    this.form.get('vat')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => this.calculateTotals());
	    this.form.get('discount')?.valueChanges
	      .pipe(takeUntil(this._unsubscribeAll))
	      .subscribe(() => this.calculateTotals());
	    this.form.get('poDate')?.valueChanges
	      .pipe(takeUntil(this._unsubscribeAll))
	      .subscribe((poDate) => {
	        this.form.patchValue({ requestDate: poDate || null }, { emitEvent: false });
	      });

    this.form.get('notSparePartCase')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((isNotSparePart) => {
        if (isNotSparePart) {
          this.form.patchValue({
            sparePartVerifiedBy: '',
            sparePartDate: null
          });
        }
      });

    this.form.get('company')?.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((value) => this.filterSuppliers(value));
  }

  private loadSuppliers(): void {
    this.suppliersService.getSuppliers()
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe({
        next: (suppliers) => {
          this.suppliers = suppliers;
          this.filteredSuppliers = suppliers.slice(0, 50);
          this.filterSuppliers(this.form.get('company')?.value || '');
        },
        error: (error) => {
          console.error('Error loading suppliers:', error);
          this.filteredSuppliers = [];
        }
      });
  }

  private filterSuppliers(value: unknown): void {
    const term = this.toCleanString(value).toLowerCase();
    const matches = !term
      ? this.suppliers
      : this.suppliers.filter((supplier) => {
          const haystack = [
            supplier.name,
            supplier.contact_person,
            supplier.phone,
            supplier.email,
            supplier.address,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(term);
        });

    this.filteredSuppliers = matches.slice(0, 50);
  }

  onSupplierSelectedByName(name: string): void {
    const selected = this.suppliers.find((supplier) => supplier.name === name);
    if (selected) {
      this.onSupplierSelected(selected);
    }
  }

  onSupplierSelected(supplier: SupplierOption): void {
    const contactText = this.buildSupplierContactText(supplier);

    this.form.patchValue({
      company: supplier.name || '',
      to: supplier.contact_person || supplier.name || '',
      fax: contactText,
    });
  }

  private buildSupplierContactText(supplier: SupplierOption): string {
    return [
      supplier.phone ? `Tel: ${supplier.phone}` : '',
      supplier.email ? `Email: ${supplier.email}` : '',
    ]
      .filter(Boolean)
      .join(' / ');
  }

  private loadUsers(): void {
    this.employeeService.getEmployeeOptions().subscribe({
      next: (employees) => {
        this.users = employees;

        // ✅ FIX: เก็บรายชื่อพนักงานทั้งหมดไว้ใน Cache Map
        employees.forEach((employee) => this.cacheEmployeeOption(employee));

        this.filteredPurchaseRequestUsers = this.users;
        this.filteredSparePartVerifiedUsers = this.users;
        this.filteredApprovedUsers = this.users;
        this.filteredCircUsers = this.users;
        
        // Approval workflows: โหลดจาก API search=OKK&limit=50 และ patch ค่าแรก
        this.loadPurchaseRequestUsers();
        this.loadAcknowledgedUsers();
        this.loadSignedUsers();

        this.setupSearchFilters();
        
        // Ensure any pre-patched values are properly reflected in filtered lists
        this.updateAllFilteredUsers();
      },
      error: (error) => {
        console.error('Error loading employees:', error);
        this.toastr.error('Failed to load users. Please try again.');
      }
    });
  }

  /**
   * ✅ FIX: ตัวช่วย อัปเดตรายชื่อพนักงานที่กรอง พร้อมกับดันคนเดิมที่เลือกค้างไว้ให้ไม่หลุดลิสต์
   */
  private updateFilteredUsers(
    employees: EmployeeOption[], 
    listName: 'filteredPurchaseRequestUsers' | 'filteredSparePartVerifiedUsers' | 'filteredApprovedUsers' | 'filteredSignedUsers' | 'filteredAcknowledgedUsers' | 'filteredCircUsers', 
    formControlName: string
  ): void {
    employees.forEach((employee) => this.cacheEmployeeOption(employee));
    
    let list = [...employees];
    const currentVal = this.form.get(formControlName)?.value;
    if (currentVal && !list.some(u => String(u.id) === String(currentVal))) {
      const savedUser = this.allLoadedEmployees.get(String(currentVal));
      if (savedUser) {
        list.unshift(savedUser); // ดันกลับเข้าไปเป็นที่ 1
      }
    }
    (this as any)[listName] = list;
  }

  /**
   * ✅ FIX: อัปเดตรายชื่อพนักงานในทุก dropdown เพื่อให้ค่าที่เคยเลือกไว้ไม่หลุดหาย
   */
  private updateAllFilteredUsers(): void {
    this.updateFilteredUsers(this.filteredPurchaseRequestUsers, 'filteredPurchaseRequestUsers', 'purchaseRequestBy');
    this.updateFilteredUsers(this.filteredSparePartVerifiedUsers, 'filteredSparePartVerifiedUsers', 'sparePartVerifiedBy');
    this.updateFilteredUsers(this.filteredApprovedUsers, 'filteredApprovedUsers', 'approvedBy');
    this.updateFilteredUsers(this.filteredSignedUsers, 'filteredSignedUsers', 'signedBy');
    this.updateFilteredUsers(this.filteredAcknowledgedUsers, 'filteredAcknowledgedUsers', 'acknowledgedBy');
    this.updateFilteredUsers(this.filteredCircUsers, 'filteredCircUsers', 'circ');
  }

  /** โหลดรายการ Purchase Request by จาก code ใน localStorage แล้ว patch เป็นค่า default ของคนที่ login */
  private loadPurchaseRequestUsers(): void {
    const userCode = getCurrentUserCode();

    if (!userCode) {
      this.updateFilteredUsers(this.users, 'filteredPurchaseRequestUsers', 'purchaseRequestBy');
      return;
    }

    this.employeeService.getEmployeeOptionsFromApi(userCode, null).subscribe({
      next: (prEmployees) => {
        const target = String(userCode).trim().toLowerCase();
        const exactEmployee = prEmployees.find((employee) =>
          String(employee.code || '').trim().toLowerCase() === target ||
          String(employee.id || '').trim().toLowerCase() === target ||
          String(employee.employeeId || '').trim().toLowerCase() === target
        );
        const requesterOptions = exactEmployee ? [exactEmployee] : prEmployees;

        this.updateFilteredUsers(requesterOptions, 'filteredPurchaseRequestUsers', 'purchaseRequestBy');
        this.patchDefaultFromEmployee(exactEmployee || prEmployees[0]);
        this.patchDefaultRequester(requesterOptions);
      },
      error: (err) => {
        console.error('Error loading purchase request users:', err);
        this.updateFilteredUsers(this.users, 'filteredPurchaseRequestUsers', 'purchaseRequestBy');
      }
    });
  }

  private patchDefaultRequester(prEmployees: EmployeeOption[]): void {
     // Patch default only if value is currently empty/blank (safeguard for Edit Mode)
     const currentVal = this.form.get('purchaseRequestBy')?.value;
     const requisitionId = this.route.snapshot.queryParams['fromRequisition'];

     // Patch default only for NEW PO (not edit, not from requisition)
     if (prEmployees.length > 0 && (!currentVal || currentVal === '') && !this.isEditMode && !requisitionId) {
       this.form.patchValue(
         { purchaseRequestBy: prEmployees[0].id }, // prEmployees[0].id is the CODE
         { emitEvent: false }
       );
     }
  }

  private patchDefaultFromEmployee(employee: EmployeeOption | null | undefined): void {
    if (!employee) {
      return;
    }

    const fromControl = this.form.get('from');
    const currentValue = this.toCleanString(fromControl?.value);
    const canPatch =
      !fromControl?.dirty &&
      this.isIgnoredFromValue(currentValue);

    if (!canPatch) {
      return;
    }

    const employeeName = this.getEmployeeSenderName(employee);
    if (employeeName) {
      fromControl?.patchValue(employeeName, { emitEvent: false });
    }
  }

  private getEmployeeSenderName(employee: EmployeeOption): string {
    const employeeName = this.toCleanString(employee.displayLabel)
      || this.toCleanString(employee.name)
      || this.toCleanString(employee.code)
      || this.toCleanString(employee.id);

    return this.isIgnoredFromValue(employeeName) ? '' : employeeName;
  }

  private patchFromFromEmployeeRef(ref: string | number | null | undefined): void {
    const currentValue = this.toCleanString(this.form.get('from')?.value);
    if (!ref || !this.isIgnoredFromValue(currentValue)) {
      return;
    }

    const cachedEmployee = this.findLoadedEmployeeByRef(ref);
    if (cachedEmployee) {
      this.patchDefaultFromEmployee(cachedEmployee);
      return;
    }

    this.employeeService.getEmployeeOptionByReference(ref)
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe((employee) => this.patchDefaultFromEmployee(employee));
  }

  private cacheEmployeeOption(employee: EmployeeOption | null | undefined): void {
    if (!employee) {
      return;
    }

    if (employee.id) this.allLoadedEmployees.set(String(employee.id), employee);
    if (employee.code) this.allLoadedEmployees.set(employee.code, employee);
    if (employee.employeeId !== undefined && employee.employeeId !== null) {
      this.allLoadedEmployees.set(String(employee.employeeId), employee);
    }
  }

  private ensureSelectedWorkflowUsersLoaded(): void {
    this.workflowPersonControlNames.forEach((controlName) => {
      const control = this.form.get(controlName);
      const currentValue = this.toCleanString(control?.value);

      if (!control || !currentValue) {
        return;
      }

      const cachedEmployee = this.findLoadedEmployeeByRef(currentValue);
      if (cachedEmployee) {
        this.normalizeWorkflowPersonControl(controlName, currentValue, cachedEmployee);
        return;
      }

      this.employeeService.getEmployeeOptionByReference(currentValue)
        .pipe(takeUntil(this._unsubscribeAll))
        .subscribe((employee) => {
          if (!employee) {
            return;
          }

          this.cacheEmployeeOption(employee);
          this.normalizeWorkflowPersonControl(controlName, currentValue, employee);
          this.updateAllFilteredUsers();
        });
    });

    this.updateAllFilteredUsers();
  }

  private normalizeWorkflowPersonControl(
    controlName: string,
    expectedCurrentValue: string,
    employee: EmployeeOption
  ): void {
    const control = this.form.get(controlName);
    if (!control || this.toCleanString(control.value) !== expectedCurrentValue) {
      return;
    }

    const normalizedCode = this.toCleanString(employee.id || employee.code);
    if (normalizedCode && normalizedCode !== expectedCurrentValue) {
      control.patchValue(normalizedCode, { emitEvent: false });
    }
  }

  private findLoadedEmployeeByRef(ref: string | number | null | undefined): EmployeeOption | null {
    const target = this.toCleanString(ref).toLowerCase();
    if (!target) {
      return null;
    }

    const direct = this.allLoadedEmployees.get(String(ref));
    if (direct) {
      return direct;
    }

    return Array.from(this.allLoadedEmployees.values()).find((employee) => {
      const candidates = [
        employee.id,
        employee.code,
        employee.employeeId !== undefined && employee.employeeId !== null ? String(employee.employeeId) : '',
        employee.email,
      ];

      return candidates.some((candidate) => this.toCleanString(candidate).toLowerCase() === target);
    }) || null;
  }

  private isIgnoredFromValue(value: unknown): boolean {
    const normalized = this.toCleanString(value).toLowerCase();
    return !normalized
      || normalized === this.defaultFromLabel.toLowerCase()
      || normalized === 'admin'
      || normalized === 'administrator';
  }

  /** โหลดรายการ Acknowledged by จาก /api/employees?search=JN&limit=50 เหมือนหน้า PR */
  private loadAcknowledgedUsers(): void {
    this.employeeService.getEmployeeOptions('JN', 50).subscribe({
      next: (ackEmployees) => {
        this.updateFilteredUsers(ackEmployees, 'filteredAcknowledgedUsers', 'acknowledgedBy');
        
        // Patch default only if value is currently empty/blank (safeguard for Edit Mode)
        const currentVal = this.form.get('acknowledgedBy')?.value;
        if (ackEmployees.length > 0 && !this.isEditMode && (!currentVal || currentVal === '')) {
          this.form.patchValue(
            { acknowledgedBy: ackEmployees[0].id },
            { emitEvent: false }
          );
        }
      },
      error: (err) => {
        console.error('Error loading acknowledged users (JN):', err);
        this.updateFilteredUsers(this.users, 'filteredAcknowledgedUsers', 'acknowledgedBy');
      }
    });
  }

  /** โหลดรายการ Signed by จาก /api/employees?search=OKK&limit=50 และ patch ค่าแรกให้ signedBy เสมอ */
  private loadSignedUsers(): void {
    this.employeeService.getEmployeeOptions('OKK', 50).subscribe({
      next: (signedEmployees) => {
        this.updateFilteredUsers(signedEmployees, 'filteredSignedUsers', 'signedBy');
        
        // Patch default only if value is currently empty/blank (safeguard for Edit Mode)
        const currentVal = this.form.get('signedBy')?.value;
        if (signedEmployees.length > 0 && (!currentVal || currentVal === '')) {
          this.form.patchValue(
            { signedBy: signedEmployees[0].id },
            { emitEvent: false }
          );
        }
      },
      error: (err) => {
        console.error('Error loading signed users (OKK):', err);
        this.updateFilteredUsers(this.users, 'filteredSignedUsers', 'signedBy');
      }
    });
  }

  private setupSearchFilters(): void {
    this.purchaseRequestSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredPurchaseRequestUsers', 'purchaseRequestBy');
      });

    this.sparePartVerifiedSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredSparePartVerifiedUsers', 'sparePartVerifiedBy');
      });

    this.approvedSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredApprovedUsers', 'approvedBy');
      });

    this.signedSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredSignedUsers', 'signedBy');
      });

    this.acknowledgedSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredAcknowledgedUsers', 'acknowledgedBy');
      });

    this.circSearchCtrl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          const searchTerm = term ? term.toString().trim() : '';
          return this.employeeService.getEmployeeOptions(searchTerm, 50);
        }),
        takeUntil(this._unsubscribeAll)
      )
      .subscribe((employees) => {
        this.updateFilteredUsers(employees, 'filteredCircUsers', 'circ');
      });
  }

  ngOnDestroy(): void {
    this._unsubscribeAll.next(null);
    this._unsubscribeAll.complete();
  }

  private checkEditMode(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id && id !== 'new') {
        this.isEditMode = true;
        this.currentPurchaseOrderId = id;
        this.loadPurchaseOrder(id);
      } else {
        // Create mode: fetch next PO number from API
        this.purchaseOrderService.getNextPoNumber().subscribe({
          next: (nextNo) => {
            this.form.patchValue({ poNo: String(nextNo) });
          },
          error: (err) => {
            console.error('Failed to load next PO number:', err);
          }
        });
      }
    });
  }

  private checkCreateFromRequisition(): void {
    this.route.queryParams.subscribe((params) => {
      const requisitionId = params['fromRequisition'];
      if (requisitionId && !this.isEditMode) {
        this.loadRequisitionData(requisitionId);
      }
    });
  }

	  private loadRequisitionData(requisitionId: string): void {
    this.isLoading = true;

    this.purchaseRequisitionService.findOne(requisitionId).subscribe({
      next: (response: any) => {
        let data: any;
        if (response.status !== undefined && response.data) data = response.data;
        else data = response;

        while (this.itemsFormArray.length !== 0) this.itemsFormArray.removeAt(0);

        const items = data.items || [];
        items.forEach((item: any) => {
          const itemGroup = this.createItemFormGroup();
          itemGroup.patchValue({
            item: item.item || '',
            description: item.description || '',
            needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration),
            assetCode: item.asset_code || '',
            quantity: item.quantity || 0,
            unitPrice: item.unit_price || 0,
            amount: item.amount || 0
          });
          this.itemsFormArray.push(itemGroup);
        });

        if (this.itemsFormArray.length === 0) this.addItem();

        const parseDate = (dateStr: string | null | undefined): Date | null => {
          if (!dateStr) return null;
          const d = new Date(dateStr);
          return isNaN(d.getTime()) ? null : d;
        };

	        this.form.patchValue({
	          to: data.to || '-',
	          subject: data.subject || '',
	          company: this.normalizeBlankPlaceholder(data.company),
	          from: this.form.get('from')?.value || this.defaultFromLabel,
          purchaseRequisitionId: this.resolvePurchaseRequisitionId(data, requisitionId),
          purchaseRequisitionNo: this.resolvePurchaseRequisitionNo(data),
		          requisitionDate: parseDate(data.date),
		          currency: data.currency_code || data.currency || 'THB',
	          vat: data.vat === true || data.vat === 1,
          discount: this.toAmountNumber(data.discount),
	          paymentTerm: data.payment_term ?? this.defaultPaymentTerm,
	          otherConditions: data.other_conditions || '',
	          purchaseRequestBy: data.requested_by || '',
	          requestDate: this.form.get('poDate')?.value || new Date(),
          notSparePartCase: data.not_spare_part === 1 || data.not_spare_part === true,
          sparePartVerifiedBy: data.verified_by_is || '',
          sparePartDate: parseDate(data.verified_is_date),
          approvedBy: data.approved_by || '',
          approvedDate: parseDate(data.approved_date)
        });
        this.patchFromFromEmployeeRef(data.requested_by);
        this.ensureSelectedWorkflowUsersLoaded();

        this.calculateTotals();

        this.isLoading = false;
        this.toastr.success('Purchase Requisition data loaded successfully. Please review and complete the Purchase Order form.');
      },
      error: (error) => {
        console.error('Error loading requisition:', error);
        this.toastr.error(error?.error?.message || 'Failed to load requisition data. Please try again.');
        this.isLoading = false;
      }
    });
  }

    private loadPurchaseOrder(id: string): void {
    this.isLoading = true;
    this.purchaseOrderService.findOne(id).subscribe({
      next: (purchaseOrder: any) => {
	        this.form.patchValue({
	          to: purchaseOrder.to ?? '-',
	          company: this.normalizeBlankPlaceholder(purchaseOrder.company),
	          subject: purchaseOrder.subject || '',
	          fax: purchaseOrder.fax || '',
          from: purchaseOrder.from ?? this.defaultFromLabel,
          cc: purchaseOrder.cc || '',
          currency: purchaseOrder.currency || 'THB',
          vat: purchaseOrder.vat === true || purchaseOrder.vat === 1,
          poNo: purchaseOrder.poNo || '',
          poDate: purchaseOrder.poDate,
          purchaseRequisitionId: purchaseOrder.purchaseRequisitionId || null,
          purchaseRequisitionNo: purchaseOrder.purchaseRequisitionNo || '',
          requisitionDate: purchaseOrder.requisitionDate,
          pageNumber: purchaseOrder.pageNumber,
          totalPages: purchaseOrder.totalPages,
          circ: purchaseOrder.circ || '',
          quotationNo: purchaseOrder.quotationNo || '',
          quotationDate: purchaseOrder.quotationDate,
          deliveryDate: typeof purchaseOrder.deliveryDate === 'string'
            ? purchaseOrder.deliveryDate
            : (purchaseOrder.deliveryDate ? this.formatDate(purchaseOrder.deliveryDate) : ''),
          paymentTerm: purchaseOrder.paymentTerm ?? this.defaultPaymentTerm,
          otherConditions: purchaseOrder.otherConditions || '',
          
          // Approval & Review
          purchaseRequestBy: purchaseOrder.purchaseRequestBy || '',
          requestDate: purchaseOrder.poDate || null,
          notSparePartCase: purchaseOrder.isSparePart === false,
          sparePartVerifiedBy: purchaseOrder.verifiedBy || '',
          sparePartDate: purchaseOrder.verifiedDate || purchaseOrder.verifiedByDate,
          approvedBy: purchaseOrder.approvedBy || '',
          approvedDate: purchaseOrder.approvedDate || purchaseOrder.approvedByDate,

          discount: purchaseOrder.discount ?? 0,

	          // Checklist (keep null as unselected)
	          deliveryOnTime: this.booleanRadioValue(purchaseOrder.deliveryOnTime),
	          meetQualityRequirement: this.booleanRadioValue(purchaseOrder.meetQualityRequirement),
	          meetGuidelines: this.booleanRadioValue(purchaseOrder.meetGuidelinesForEquipment),

          signedBy: purchaseOrder.signedBy || '',
          signedDate: purchaseOrder.signedDate || purchaseOrder.signedByDate,
          acknowledgedBy: purchaseOrder.acknowledgedBy || '',
          acknowledgedDate: purchaseOrder.acknowledgedByDate,
          status: purchaseOrder.status || 'SUBMITTED'
        });
        this.patchFromFromEmployeeRef(purchaseOrder.purchaseRequestBy);
        this.currentDocumentStatus = (purchaseOrder.status || 'SUBMITTED') as any;

        // ✅ FIX: หลังจาก patchValue แล้ว ต้องบังคับ updateFilteredUsers ทุก dropdown 
        // เพื่อดึงรายชื่อคนที่เลือกไว้ขึ้นมาแสดง (ในกรณีที่เขาไม่ได้อยู่ในลิสต์เริ่มต้น 50-200 คน)
        this.ensureSelectedWorkflowUsersLoaded();

        if (purchaseOrder.items && purchaseOrder.items.length > 0) {
          while (this.itemsFormArray.length !== 0) this.itemsFormArray.removeAt(0);

          purchaseOrder.items.forEach((item: any) => {
            const itemGroup = this.createItemFormGroup();
            itemGroup.patchValue({
              item: item.item,
              description: item.description,
              needAssetCodeRegistration: this.toBooleanFlag(item.need_asset_code_registration ?? item.needAssetCodeRegistration),
              assetCode: item.asset_code || item.assetCode || '',
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount
            });
            this.itemsFormArray.push(itemGroup);
          });

        }

        if (Array.isArray(purchaseOrder.attachments) && purchaseOrder.attachments.length > 0) {
          const arr = this.attachmentsArray;
          arr.clear();
          purchaseOrder.attachments.forEach((path: string) => {
            const name = path.split('/').pop() || path;
            arr.push(this.fb.group({
              id: [null],
              file_name: [name],
              file_path: [path],
              file_url: [''],
              file_size: [null],
              mime_type: [''],
              description: [''],
              uploaded_at: [null],
              type: ['file'],
              file: [null]
            }));
          });
        }

        this.calculateTotals();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading purchase order:', error);
        this.isLoading = false;
        this.toastr.error('Failed to load purchase order. Please try again.');
      }
    });
  }

  /** Selected currency for display (table headers, amounts) */
  get selectedCurrency(): string {
    return this.form?.get('currency')?.value || 'THB';
  }

  get requiredFieldTotal(): number {
    return this.requiredControlsForCounter.length + this.requiredItemControlCountForCounter;
  }

  get requiredFieldsLeft(): number {
    const missingFormControls = this.requiredControlsForCounter.filter((name) => {
      const control = this.form.get(name);
      return control ? control.invalid : false;
    }).length;

    let missingItemControls = 0;
    this.itemsFormArray.controls.forEach((group) => {
      const requiredItemFields = ['description', 'quantity', 'unitPrice'];
      if (group.get('needAssetCodeRegistration')?.value) {
        requiredItemFields.push('assetCode');
      }

      requiredItemFields.forEach((name) => {
        const control = group.get(name);
        if (control?.invalid) {
          missingItemControls += 1;
        }
      });
    });

    return missingFormControls + missingItemControls;
  }

  get requiredProgressPercent(): number {
    if (!this.requiredFieldTotal) {
      return 100;
    }

    const completed = this.requiredFieldTotal - this.requiredFieldsLeft;
    return Math.max(6, Math.round((completed / this.requiredFieldTotal) * 100));
  }

  private get requiredControlsForCounter(): string[] {
    return [
      'to',
      'company',
      'from',
      'requisitionDate',
      'currency',
      'purchaseRequestBy',
      'approvedBy',
      'signedBy',
      'acknowledgedBy',
    ];
  }

  private get requiredItemControlCountForCounter(): number {
    return this.itemsFormArray.controls.reduce((total, group) => {
      const assetCodeCount = group.get('needAssetCodeRegistration')?.value ? 1 : 0;
      return total + 3 + assetCodeCount;
    }, 0);
  }

  /** Currency options for dropdown – common/base currencies (หน่วยเงินพื้นฐานที่ใช้งานทั่วไป) */
  readonly currencyOptions: { value: string; label: string }[] = [
    { value: 'THB', label: 'THB - Thai Baht' },
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'JPY', label: 'JPY - Japanese Yen' },
    { value: 'CNY', label: 'CNY - Chinese Yuan' },
    { value: 'SGD', label: 'SGD - Singapore Dollar' },
    { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
    { value: 'AUD', label: 'AUD - Australian Dollar' },
    { value: 'CHF', label: 'CHF - Swiss Franc' },
    { value: 'HKD', label: 'HKD - Hong Kong Dollar' },
    { value: 'KRW', label: 'KRW - Korean Won' },
    { value: 'INR', label: 'INR - Indian Rupee' },
    { value: 'VND', label: 'VND - Vietnamese Dong' },
  ];

  get itemsFormArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  createItemFormGroup(): FormGroup {
    const itemGroup = this.fb.group({
      item: [''],
      description: ['', Validators.required],
      needAssetCodeRegistration: [false],
      assetCode: [''],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      amount: [0]
    });

    this.configureAssetCodeValidator(itemGroup);
    this.bindItemAmountCalculation(itemGroup);

    return itemGroup;
  }

  private bindItemAmountCalculation(itemGroup: FormGroup): void {
    itemGroup.get('quantity')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => this.calculateItemAmount(itemGroup));
    itemGroup.get('unitPrice')?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(() => this.calculateItemAmount(itemGroup));
  }

  private configureAssetCodeValidator(itemGroup: FormGroup): void {
    const needAssetCodeControl = itemGroup.get('needAssetCodeRegistration');
    const assetCodeControl = itemGroup.get('assetCode');

    const syncValidator = (needAssetCode: unknown) => {
      if (needAssetCode === true) {
        assetCodeControl?.setValidators([Validators.required]);
      } else {
        assetCodeControl?.clearValidators();
        assetCodeControl?.setValue('', { emitEvent: false });
      }
      assetCodeControl?.updateValueAndValidity({ emitEvent: false });
    };

    syncValidator(needAssetCodeControl?.value);
    needAssetCodeControl?.valueChanges
      .pipe(takeUntil(this._unsubscribeAll))
      .subscribe(syncValidator);
  }

  addItem(): void {
    const itemGroup = this.createItemFormGroup();
    this.itemsFormArray.push(itemGroup);
  }

  removeItem(index: number): void {
    if (this.itemsFormArray.length > 1) {
      this.itemsFormArray.removeAt(index);
      this.calculateTotals();
    }
  }

  openAddItemsFromPrDialog(): void {
    const ref = this.dialog.open(AddItemsFromPrDialogComponent, {
      width: '1180px',
      maxWidth: '96vw',
      maxHeight: '90vh'
    });
    ref.afterClosed().subscribe((selected: PrForSelectionItem[] | undefined) => {
      if (selected && selected.length > 0) {
        this.addItemsFromPr(selected);
      }
    });
  }

  /** Add items from selected PRs: merge all PR items into the form items array */
	  addItemsFromPr(selectedPrs: PrForSelectionItem[]): void {
    // Remove untouched placeholder rows before appending PR items.
    for (let index = this.itemsFormArray.length - 1; index >= 0; index--) {
      if (this.isItemRowEmpty(this.itemsFormArray.at(index) as FormGroup)) {
        this.itemsFormArray.removeAt(index);
      }
    }

	    selectedPrs.forEach((pr) => {
      (pr.items || []).forEach((row) => {
        const qty = Number(row.quantity) || 0;
        const price = Number(row.unit_price) || 0;
	        const amount = this.roundToCurrency(Number(row.amount) || qty * price);
        const itemGroup = this.createItemFormGroup();
        itemGroup.patchValue({
          item: row.item || '',
          description: row.description || '',
          needAssetCodeRegistration: this.toBooleanFlag(row.need_asset_code_registration),
          assetCode: '',
          quantity: qty,
          unitPrice: price,
          amount
        });
        this.itemsFormArray.push(itemGroup);
      });
    });

	    const primaryPr = selectedPrs[0];
	    if (primaryPr) {
      const requisitionDate = this.parseDateValue(primaryPr.date);
      this.form.patchValue({
        purchaseRequisitionId: this.resolvePurchaseRequisitionId(primaryPr),
        purchaseRequisitionNo: this.resolvePurchaseRequisitionNo(primaryPr),
        subject: primaryPr.subject || this.form.get('subject')?.value || '',
	        requisitionDate,
	        currency: primaryPr.currency_code || this.form.get('currency')?.value || 'THB',
	        paymentTerm: primaryPr.payment_term ?? primaryPr.paymentTerm ?? this.form.get('paymentTerm')?.value ?? this.defaultPaymentTerm,
	        purchaseRequestBy: primaryPr.requested_by || this.form.get('purchaseRequestBy')?.value || '',
	        requestDate: this.form.get('poDate')?.value || new Date()
      });
      this.patchFromFromEmployeeRef(primaryPr.requested_by);
      this.ensureSelectedWorkflowUsersLoaded();
	    }

	    // ✅ ถ้า PR ที่เลือกมามี VAT ให้ patch ติ๊ก VAT ให้ด้วย
    const hasVat = selectedPrs.some((pr) => pr.vat === true || pr.vat === 1);
	    if (hasVat) {
	      this.form.patchValue({ vat: true });
	    }

    const selectedDiscount = selectedPrs.reduce((sum, pr) => {
      const discount = Number(pr.discount);
      return sum + (Number.isFinite(discount) ? discount : 0);
    }, 0);
    if (selectedDiscount > 0) {
      const currentDiscount = Number(this.form.get('discount')?.value) || 0;
      this.form.patchValue({ discount: this.roundToCurrency(currentDiscount + selectedDiscount) });
    }

	    this.calculateTotals();
	  }

  /** แถวว่าง = แถว placeholder ที่ยังไม่กรอก item/description และยังไม่มีราคา */
  private isItemRowEmpty(itemGroup: FormGroup): boolean {
    const item = String(itemGroup.get('item')?.value ?? '').trim();
    const description = String(itemGroup.get('description')?.value ?? '').trim();
    const assetCode = String(itemGroup.get('assetCode')?.value ?? '').trim();
    const unitPrice = Number(itemGroup.get('unitPrice')?.value);
    const amount = Number(itemGroup.get('amount')?.value);
    return item === '' &&
      description === '' &&
      assetCode === '' &&
      (unitPrice === 0 || !Number.isFinite(unitPrice)) &&
      (amount === 0 || !Number.isFinite(amount));
  }

	  calculateItemAmount(itemGroup: FormGroup): void {
	    const quantity = Number(itemGroup.get('quantity')?.value) || 0;
	    const unitPrice = Number(itemGroup.get('unitPrice')?.value) || 0;
	    const amount = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? this.roundToCurrency(quantity * unitPrice) : 0;
	    itemGroup.get('amount')?.setValue(amount);
	    this.calculateTotals();
	  }

	  calculateTotals(): void {
	    const items = this.itemsFormArray.value;
	    const itemsTotal = this.roundToCurrency(items.reduce((sum: number, item: PurchaseOrderItem) => {
	      const amount = Number(item.amount);
	      return sum + (Number.isFinite(amount) ? amount : 0);
	    }, 0));
	    const discount = Math.max(0, this.roundToCurrency(Number(this.form.get('discount')?.value) || 0));
	    const subTotal = this.roundToCurrency(Math.max(0, itemsTotal - discount));
	    const vatChecked = this.form.get('vat')?.value === true || this.form.get('vat')?.value === 1;
	    const vat = vatChecked ? this.roundToCurrency(subTotal * 0.07) : 0;
	    const grandTotal = this.roundToCurrency(Number(subTotal) + Number(vat));

    this.form.patchValue({
        subTotal: subTotal,
        vatValue: vat,
        grandTotal: grandTotal
    }, { emitEvent: false });
  }

  onSubmit(): void {
    // ✅ FIX: กัน “กดแล้วเงียบ” + ให้โชว์ error ชัด
    try {
      if (this.isSubmitting || this.isSavingDraft) return;
      this.suppressValidationErrors = false;

      if (!this.form.valid) {
        this.markFormGroupTouched();
        const missingLabels = this.getMissingSubmitFieldLabels();
        this.toastr.error(
          missingLabels.length > 0
            ? `Please fill in required fields: ${missingLabels.join(', ')}`
            : 'Please fill in all required fields correctly.'
        );
        this.scrollToFirstInvalidControl();
        return;
      }

      const confirmation = this.fuseConfirmationService.open({
        title: this.isEditMode ? 'Confirm workflow reset' : 'Confirm submit',
        message: this.isEditMode
          ? 'If you save this update, the entire approval workflow will be reset and new emails will be sent in sequence. Do you want to continue?'
          : 'Are you sure you want to submit this purchase order?',
        icon: { show: true, name: 'heroicons_outline:question-mark-circle', color: 'primary' },
        actions: {
          cancel: { show: true, label: 'Cancel' },
          confirm: { show: true, label: this.isEditMode ? 'Update' : 'Submit', color: 'primary' },
        },
        dismissible: false,
      });

      confirmation.afterClosed().subscribe((result) => {
        if (result !== 'confirmed') return;
        this.submitForm('submitted');
      });
    } catch (e) {
      console.error('SUBMIT CRASH', e); // ✅ FIX: จะเห็น error ชัดๆ ใน console
      this.isSubmitting = false;
      this.toastr.error('Submit crashed. Please check console.');
    }
  }

  onSaveDraft(): void {
    try {
      if (!this.canSaveDraft || this.isSubmitting || this.isSavingDraft) return;
      this.suppressValidationErrors = true;
      this.clearFormValidationState();
      this.submitForm('draft');
    } catch (e) {
      console.error('SAVE DRAFT CRASH', e);
      this.isSavingDraft = false;
      this.toastr.error('Save draft crashed. Please check console.');
    }
  }

  get canSaveDraft(): boolean {
    return !this.isEditMode || this.currentDocumentStatus === 'DRAFT';
  }

	  private submitForm(targetStatus: 'draft' | 'submitted' = 'submitted'): void {
	    try {
      const isDraft = targetStatus === 'draft';
      this.isSubmitting = !isDraft;
      this.isSavingDraft = isDraft;
      this.calculateTotals();

		      const formData = this.form.value;
	      const poDateFormatted = formData.poDate ? this.formatDate(formData.poDate) : '';

      // ✅ FIX: แปลง id/number เป็น string ก่อน trim
      const prBy = this.toCleanString(formData.purchaseRequestBy);
      const verifiedBy = this.toCleanString(formData.sparePartVerifiedBy);
      const approvedBy = this.toCleanString(formData.approvedBy);
      const signedBy = this.toCleanString(formData.signedBy);
      const ackBy = this.toCleanString(formData.acknowledgedBy);
      const circ = this.toCleanString(formData.circ);

      const attachmentsPaths = (this.attachmentsArray?.value || [])
        .map((a: { file_path?: string }) => a?.file_path)
        .filter((p: string | undefined): p is string => !!p)
        .map((p: string) => p.startsWith('/') ? p : `/${p}`);

      if (!this.ensurePdfOnlyAttachments()) {
        this.isSubmitting = false;
        this.isSavingDraft = false;
        return;
      }

      // ✅ FIX: ดูขั้นตอนถัดไปหากข้ามขั้นตอนหน้า (Verified -> Approved -> Circ -> Signed -> Acknowledged)
      const usesVerifiedStep = !formData.notSparePartCase && !!verifiedBy;
      const isApprovedPending = !usesVerifiedStep && !!approvedBy;
      const isCircPending = !usesVerifiedStep && !isApprovedPending && !!circ;
      const isSignedPending = !usesVerifiedStep && !isApprovedPending && !isCircPending && !!signedBy;
      const isAcknowledgedPending = !usesVerifiedStep && !isApprovedPending && !isCircPending && !isSignedPending && !!ackBy;

      const itemPayloads = (formData.items || [])
        .map((item: PurchaseOrderItem) => {
          const needAssetCodeRegistration = item.needAssetCodeRegistration === true;

          return {
            item: String(item.item ?? '').trim(),
            description: item.description || '',
            need_asset_code_registration: needAssetCodeRegistration ? 1 : 0,
            asset_code: needAssetCodeRegistration ? (item.assetCode || '').trim() : null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            amount: item.amount
          };
        })
        .filter((item) => !isDraft || !this.isItemPayloadEmpty(item));

      const apiPayload = {
        status: targetStatus,
        to: formData.to ?? '-',
        company: formData.company ?? '',
        fax: formData.fax || '',
        from: formData.from ?? this.defaultFromLabel,
	        cc: formData.cc || '',
	        subject: formData.subject || '',
        currency_code: formData.currency || 'THB',
        po_no: formData.poNo || '',
        po_date: poDateFormatted,
        purchase_requisition_id: formData.purchaseRequisitionId || null,
        purchase_requisition_no: formData.purchaseRequisitionNo || null,
	        requisition_date: this.formatDate(formData.requisitionDate),
        page: formData.pageNumber || 1,
        total_page: formData.totalPages || 1,
        circ: circ || null,
        vat: formData.vat ? 1 : 0,
        discount: formData.discount ?? 0,
        sub_total: Number(formData.subTotal || 0),
        vat_value: Number(formData.vatValue || 0),
        grand_total: Number(formData.grandTotal || 0),
        quotation_no: formData.quotationNo || '',
        quotation_date: formData.quotationDate ? this.formatDate(formData.quotationDate) : '',
        delivery_date: (formData.deliveryDate && typeof formData.deliveryDate === 'string')
          ? formData.deliveryDate
          : (formData.deliveryDate ? this.formatDate(formData.deliveryDate) : ''),
        payment_term: formData.paymentTerm ?? this.defaultPaymentTerm,
        other_conditions: formData.otherConditions || '',
        attachments: attachmentsPaths,

	        purchase_request_by: prBy ? prBy : null, // ✅ FIX
	        purchase_request_by_date: (!isDraft && prBy) ? poDateFormatted : null,
	        purchase_request_by_status: (!isDraft && prBy) ? 'approve' : null, // Requested by is approved at creation.
	        purchase_request_date: (!isDraft && prBy) ? poDateFormatted : '',

        verified_by: formData.notSparePartCase ? null : (verifiedBy ? verifiedBy : null), // ✅ FIX
        verified_by_date: null,
        verified_by_status: (!isDraft && usesVerifiedStep) ? 'pending' : null, // ✅ FIX: Cascade
        verified_date: (!isDraft && !formData.notSparePartCase && formData.sparePartDate) ? this.formatDate(formData.sparePartDate) : '',
        is_spare_part: formData.notSparePartCase ? 0 : 1,
 
        approved_by: approvedBy ? approvedBy : null, // ✅ FIX
        approved_by_date: null,
        approved_by_status: (!isDraft && isApprovedPending) ? 'pending' : null, // ✅ FIX: Cascade
        approved_date: (!isDraft && formData.approvedDate) ? this.formatDate(formData.approvedDate) : '',

        circ_date: null,
        circ_status: (!isDraft && isCircPending) ? 'pending' : null,
 
        signed_by: signedBy ? signedBy : null, // ✅ FIX
        signed_by_date: null,
        signed_by_status: (!isDraft && isSignedPending) ? 'pending' : null, // ✅ FIX: Cascade
        signed_date: (!isDraft && formData.signedDate) ? this.formatDate(formData.signedDate) : '',
 
        acknowledged_by: ackBy ? ackBy : null, // ✅ FIX
        acknowledged_by_date: null,
        acknowledged_by_status: (!isDraft && isAcknowledgedPending) ? 'pending' : null, // ✅ FIX: Cascade
        acknowledged_date: (!isDraft && formData.acknowledgedDate) ? this.formatDate(formData.acknowledgedDate) : '',

        items: itemPayloads
      };

      if (this.isEditMode && this.currentPurchaseOrderId) {
        this.purchaseOrderService.update(this.currentPurchaseOrderId, apiPayload as any).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            this.isSavingDraft = false;
            if (isDraft) {
              this.handleDraftSaved(response);
              return;
            }

            this.currentDocumentStatus = 'SUBMITTED';
            this.toastr.success('Purchase Order updated successfully!');
            this.sendInitialEmailNotification(apiPayload, response, this.currentPurchaseOrderId);
            setTimeout(() => this.router.navigate(['/purchase-order']), 1500);
          },
          error: (error) => {
            this.isSubmitting = false;
            this.isSavingDraft = false;
            this.toastr.error(error?.error?.message || (isDraft ? 'Failed to save draft. Please try again.' : 'Failed to update purchase order. Please try again.'));
          }
        });
      } else {
        this.purchaseOrderService.create(apiPayload as any).subscribe({
          next: (response) => {
            this.isSubmitting = false;
            this.isSavingDraft = false;
            if (isDraft) {
              this.handleDraftSaved(response);
              return;
            }

            this.currentDocumentStatus = 'SUBMITTED';
            this.toastr.success('Purchase Order created successfully!');
            this.sendInitialEmailNotification(apiPayload, response);
            setTimeout(() => this.router.navigate(['/purchase-order']), 1500);
          },
          error: (error) => {
            this.isSubmitting = false;
            this.isSavingDraft = false;
            this.toastr.error(error?.error?.message || (isDraft ? 'Failed to save draft. Please try again.' : 'Failed to create purchase order. Please try again.'));
          }
        });
      }
    } catch (e) {
      console.error('SUBMIT CRASH', e); // ✅ FIX: จะเห็น error ชัดๆ ใน console
      this.isSubmitting = false;
      this.isSavingDraft = false;
      this.toastr.error('Submit crashed. Please check console.');
    }
  }

  private handleDraftSaved(response: any): void {
    const data = response?.data ?? response ?? {};
    const id = this.workflowEmailNotificationService.readResponseId(response) ?? (data?.id ? String(data.id) : this.currentPurchaseOrderId);
    const poNo = data?.po_no ?? data?.poNo ?? this.form.get('poNo')?.value;

    if (id) {
      this.currentPurchaseOrderId = String(id);
      this.isEditMode = true;
      this.router.navigate(['/purchase-order', id, 'edit'], { replaceUrl: true });
    }

    this.currentDocumentStatus = 'DRAFT';
    this.form.patchValue({ poNo, status: 'DRAFT' }, { emitEvent: false });
    this.toastr.success('Purchase Order draft saved successfully!');
  }

  private sendInitialEmailNotification(apiPayload: any, response: any, fallbackId: string | null = null): void {
    const purchaseOrderId = this.workflowEmailNotificationService.readResponseId(response) ?? fallbackId;
    const notificationSource = {
      ...this.workflowEmailNotificationService.createNotificationSource(apiPayload, response),
      id: purchaseOrderId
    };

    this.workflowEmailNotificationService
      .notifyInitialAction(PURCHASE_ORDER_EMAIL_CONFIG, notificationSource, purchaseOrderId)
      .subscribe({
        error: (error) => {
          console.error('Failed to send purchase order email notification:', error);
          this.toastr.warning('Purchase Order was saved, but email notification could not be sent.');
        }
      });
  }

  private formatDate(date: Date | string): string {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';

    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    const seconds = dateObj.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      control?.markAsTouched();

      if (control instanceof FormArray) {
        control.controls.forEach((item) => {
          if (item instanceof FormGroup) {
            Object.keys(item.controls).forEach((itemKey) => item.get(itemKey)?.markAsTouched());
          }
        });
      }
    });
  }

  private clearFormValidationState(): void {
    this.markControlClean(this.form);
  }

  private markControlClean(control: AbstractControl): void {
    control.markAsPristine({ onlySelf: true });
    control.markAsUntouched({ onlySelf: true });

    if (control instanceof FormGroup || control instanceof FormArray) {
      Object.values(control.controls).forEach((childControl) => {
        this.markControlClean(childControl);
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    if (this.suppressValidationErrors) {
      return false;
    }

    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (field?.hasError('required')) return `${this.getFieldLabel(fieldName)} is required`;
    if (field?.hasError('min')) return `${this.getFieldLabel(fieldName)} must be greater than 0`;
    if (field?.hasError('email')) return 'Please enter a valid email address';
    return '';
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      to: 'To',
      company: 'Company',
      from: 'From',
      requisitionDate: 'Requisition Date',
      pageNumber: 'Page Number',
      totalPages: 'Total Pages',
      quotationNo: 'Quotation Number',
      deliveryDate: 'Delivery Date',
      paymentTerm: 'Payment Term',
      purchaseRequestBy: 'Purchase Request by',
      approvedBy: 'Approved By',
      signedBy: 'Signed by',
      acknowledgedBy: 'Acknowledged by'
    };
    return labels[fieldName] || fieldName;
  }

  private getMissingRequiredFieldLabels(): string[] {
    const fieldLabels: Record<string, string> = {
      to: 'To',
      company: 'Company',
      from: 'From',
      requisitionDate: 'Requisition Date',
      currency: 'Currency',
      purchaseRequestBy: 'Purchase Request by',
      approvedBy: 'Approved By',
      signedBy: 'Signed by',
      acknowledgedBy: 'Acknowledged by'
    };

    return Object.entries(fieldLabels)
      .filter(([controlName]) => this.form.get(controlName)?.hasError('required'))
      .map(([_, label]) => label);
  }

  private getMissingSubmitFieldLabels(): string[] {
    return [
      ...this.getMissingRequiredFieldLabels(),
      ...this.getMissingItemRequiredFieldLabels()
    ];
  }

  private getMissingItemRequiredFieldLabels(): string[] {
    const missingLabels: string[] = [];

    this.itemsFormArray.controls.forEach((group, index) => {
      const itemPrefix = `Item ${index + 1}`;

      if (group.get('item')?.invalid) {
        missingLabels.push(`${itemPrefix} No.`);
      }

      if (group.get('description')?.invalid) {
        missingLabels.push(`${itemPrefix} Description`);
      }

      if (group.get('quantity')?.invalid) {
        missingLabels.push(`${itemPrefix} Quantity`);
      }

      if (group.get('unitPrice')?.invalid) {
        missingLabels.push(`${itemPrefix} Unit Price`);
      }

      if (group.get('assetCode')?.invalid) {
        missingLabels.push(`${itemPrefix} Asset Code`);
      }
    });

    return missingLabels;
  }

  private scrollToFirstInvalidControl(): void {
    const firstInvalidName = Object.keys(this.form.controls).find(
      (name) => this.form.get(name)?.invalid
    );
    if (!firstInvalidName) return;

    const selector = `[formControlName="${firstInvalidName}"], #control-${firstInvalidName}`;
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  onCancel(): void {
    this.router.navigate(['/purchase-order']);
  }

  getSubTotal(): number {
    return this.form.get('subTotal')?.value || 0;
  }

  getDiscount(): number {
    return Number(this.form.get('discount')?.value) || 0;
  }

  getVatAmount(): number {
    return this.form.get('vatValue')?.value || 0;
  }

	  getGrandTotal(): number {
	    return this.form.get('grandTotal')?.value || 0;
	  }

  private roundToCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  hasAssetCodeItems(): boolean {
    return this.itemsFormArray.controls.some((control) => control.get('needAssetCodeRegistration')?.value === true);
  }

  private isItemPayloadEmpty(item: {
    item?: string;
    description?: string;
    asset_code?: string | null;
    unit_price?: number;
    amount?: number;
  }): boolean {
    const unitPrice = Number(item.unit_price);
    const amount = Number(item.amount);

    return String(item.item ?? '').trim() === '' &&
      String(item.description ?? '').trim() === '' &&
      String(item.asset_code ?? '').trim() === '' &&
      (unitPrice === 0 || !Number.isFinite(unitPrice)) &&
      (amount === 0 || !Number.isFinite(amount));
  }

	  private toBooleanFlag(value: unknown): boolean {
	    return value === 1 || value === '1' || value === true;
	  }

	  private booleanRadioValue(value: unknown): '' | 'yes' | 'no' {
	    if (value === true || value === 1 || value === '1') {
	      return 'yes';
	    }

	    if (value === false || value === 0 || value === '0') {
	      return 'no';
	    }

	    return '';
	  }

	  private parseDateValue(value: string | Date | null | undefined): Date | null {
	    if (!value) {
	      return null;
	    }

	    if (value instanceof Date) {
	      return isNaN(value.getTime()) ? null : value;
	    }

	    const parsed = new Date(value);
	    return isNaN(parsed.getTime()) ? null : parsed;
	  }

	  /** Coerce value to number for currency pipe (avoids InvalidPipeArgument) */
  toAmountNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  // Documents management
  get documentsFormGroup(): FormGroup {
    return this.form.get('documents') as FormGroup;
  }

  get attachmentsArray(): FormArray {
    return this.documentsFormGroup.get('attachments') as FormArray;
  }

  openUploadDialog(): void {
    const ref = this.dialog.open(FuseUploadDialogComponent, {
      width: '560px',
      data: {
        allowedExtensions: ['pdf'],
        accept: 'application/pdf,.pdf',
        allowLinks: false
      }
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      const results = Array.isArray(result) ? result : [result];

      results.forEach((item: any) => {
        const attachmentGroup = this.fb.group({
          id: [item.id || null],
          file_name: [item.file_name || item.name || ''],
          file_path: [item.file_path || ''],
          file_url: [item.file_url || item.url || ''],
          file_size: [item.file_size || (item.file ? item.file.size : 0)],
          mime_type: [item.mime_type || (item.file ? item.file.type : '')],
          description: [item.description || ''],
          uploaded_at: [item.uploaded_at || new Date()],
          type: [item.type || 'file'],
          file: [item.file || null]
        });

        this.attachmentsArray.push(attachmentGroup);
      });
    });
  }

  removeAttachment(index: number): void {
    this.attachmentsArray.removeAt(index);
  }

  private ensurePdfOnlyAttachments(): boolean {
    const invalidAttachment = (this.attachmentsArray?.value || []).find((attachment: any) => {
      const path = String(
        attachment?.file_path ||
        attachment?.file_url ||
        attachment?.url ||
        attachment?.file_name ||
        attachment?.name ||
        ''
      ).trim();

      return !/\.pdf(?:$|[?#])/i.test(path);
    });

    if (invalidAttachment) {
      const name = invalidAttachment.file_name || invalidAttachment.file_path || 'selected attachment';
      this.toastr.error(`Purchase Order attachments must be PDF files only: ${name}`);
      return false;
    }

    return true;
  }

  getStepNumber(stepKey: string): number {
    let num = 1;
    if (stepKey === 'purchaseRequest') return num;
    num++;

    const isNotSparePart = this.form.get('notSparePartCase')?.value;
    if (!isNotSparePart) {
      if (stepKey === 'sparePartVerified') return num;
      num++;
    }

    if (stepKey === 'approved') return num;
    num++;

    if (stepKey === 'circ') return num;
    num++;

    if (stepKey === 'signed') return num;
    num++;

    if (stepKey === 'acknowledged') return num;

    return num;
  }
}
