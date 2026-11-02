import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { CommitteeService, EmployeeOption } from '../../shared/committee/committee.service';
import { DirectoryService, DirectoryUser } from '../../shared/directory/directory.service';
import { FileAttachComponent } from '../../shared/file-attach/file-attach.component';
import { SearchableSelectComponent, SelectOption } from '../../shared/searchable-select/searchable-select.component';
import { AttachmentInfo } from '../../shared/upload/upload.service';
import {
  PR_DEFAULT_PAYMENT_TERM, PR_SECOND_APPROVER_ABOVE, PR_VAT_RATE, PurchaseRequisitionService, SavePurchaseRequisitionPayload,
} from './purchase-requisition.service';
import { PR_STEPS } from './purchase-requisition-steps';

const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CHF', 'HKD', 'KRW', 'INR', 'VND'];

interface ItemRow { item: string; description: string; quantity: number | null; unitPrice: number | null }
const emptyRow = (): ItemRow => ({ item: '', description: '', quantity: null, unitPrice: null });
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The "envelope" form: the fields sit on a sheet laid out like the printed Purchase Requisition Form. */
@Component({
  selector: 'app-purchase-requisition-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, FileAttachComponent],
  templateUrl: './purchase-requisition-form.component.html',
  styleUrl: './purchase-requisition-form.component.scss',
})
export class PurchaseRequisitionFormComponent implements OnInit {
  private readonly service = inject(PurchaseRequisitionService);
  private readonly committees = inject(CommitteeService);
  private readonly directory = inject(DirectoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isEdit = signal(false);
  readonly editId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errors = signal<string[]>([]);
  /** Set when editing a rejected request: who rejected it and why. */
  readonly rejection = signal<{ by: string; label: string; comment: string } | null>(null);

  /** 'standard' = card layout like the other forms; 'envelope' = the sheet laid out like the printed form. */
  readonly layout = signal<'standard' | 'envelope'>(PurchaseRequisitionFormComponent.storedLayout());
  readonly currencies = CURRENCIES;
  readonly secondAbove = PR_SECOND_APPROVER_ABOVE;
  readonly defaultPaymentTerm = PR_DEFAULT_PAYMENT_TERM;

  // header
  readonly toName = signal('');
  readonly subject = signal('');
  readonly requestDate = signal(new Date().toISOString().slice(0, 10));
  readonly requestedBy = signal('');
  readonly recommendedBy = signal('');
  readonly deadline = signal('');
  readonly receivedFrom = signal('');
  readonly reasons = signal('');
  readonly currency = signal('THB');

  // items and totals
  readonly rows = signal<ItemRow[]>([emptyRow()]);
  readonly discount = signal<number | null>(null);
  readonly vat = signal(false);

  // terms
  readonly paymentTerm = signal(PR_DEFAULT_PAYMENT_TERM);
  readonly otherConditions = signal('');
  readonly quotationAttached = signal(false);
  readonly attachments = signal<AttachmentInfo[]>([]);

  // approval flow
  readonly notItEquipment = signal(false);
  readonly verifyIsBy = signal('');
  readonly verifyBy = signal('');
  readonly approverBy = signal('');
  readonly approver2By = signal('');
  readonly ackBy = signal('');
  readonly actionBy = signal('');

  // people per step: Title / Level roles and committees
  private readonly itManagers = signal<EmployeeOption[]>([]);
  private readonly verifiers = signal<EmployeeOption[]>([]);
  private readonly diMd = signal<EmployeeOption[]>([]);
  private readonly ca = signal<EmployeeOption[]>([]);
  private readonly adm = signal<EmployeeOption[]>([]);
  readonly users = signal<DirectoryUser[]>([]);

  readonly amounts = computed(() => this.rows().map((r) => round((r.quantity ?? 0) * (r.unitPrice ?? 0))));
  readonly itemsTotal = computed(() => round(this.amounts().reduce((sum, a) => sum + a, 0)));
  readonly discountValue = computed(() => Math.max(0, round(this.discount() ?? 0)));
  readonly subTotal = computed(() => round(Math.max(0, this.itemsTotal() - this.discountValue())));
  readonly vatValue = computed(() => (this.vat() ? round(this.subTotal() * PR_VAT_RATE) : 0));
  readonly grandTotal = computed(() => round(this.subTotal() + this.vatValue()));
  /** Above 50,000 a second approver is required. */
  readonly needsApprover2 = computed(() => this.grandTotal() > PR_SECOND_APPROVER_ABOVE);

  readonly userOptions = computed<SelectOption[]>(() => {
    const options = this.users().map((u) => ({ value: u.displayName, label: u.displayName }));
    const extra = [this.auth.currentUser()?.displayName, this.requestedBy()]
      .filter((name): name is string => !!name && !options.some((o) => o.value === name))
      .map((name) => ({ value: name, label: name }));
    return [...new Map([...extra, ...options].map((o) => [o.value, o])).values()];
  });

  /** Usernames that identify the requester, so they can be kept out of the approver lists. */
  private readonly requesterUsernames = computed(() => {
    const name = this.requestedBy();
    const names = new Set(this.users().filter((u) => u.displayName === name).map((u) => u.username.toLowerCase()));
    const me = this.auth.currentUser();
    if (me && me.displayName === name) names.add(me.username.toLowerCase());
    return names;
  });

  // The requester may verify or acknowledge their own request, but nobody may approve it for themselves.
  readonly verifyIsOptions = computed(() => this.options(this.itManagers(), this.verifyIsBy(), () => true));
  readonly verifyOptions = computed(() => this.options(this.verifiers(), this.verifyBy(), () => true));
  readonly ackOptions = computed(() => this.options(this.ca(), this.ackBy(), () => true));
  readonly actionOptions = computed(() => this.options(this.adm(), this.actionBy(), () => true));
  readonly approverOptions = computed(() => this.options(this.diMd(), this.approverBy(), (e) => !this.isRequester(e)));
  readonly approver2Options = computed(() => this.options(
    this.diMd(), this.approver2By(), (e) => !this.isRequester(e) && e.username !== this.approverBy(),
  ));

  private static storedLayout(): 'standard' | 'envelope' {
    try { return localStorage.getItem('pr_form_layout') === 'envelope' ? 'envelope' : 'standard'; } catch { return 'standard'; }
  }

  setLayout(layout: 'standard' | 'envelope'): void {
    this.layout.set(layout);
    try { localStorage.setItem('pr_form_layout', layout); } catch { /* not persisted */ }
  }

  ngOnInit(): void {
    forkJoin({
      itManagers: this.committees.roleDropdown('it-manager'),
      verifiers: this.committees.roleDropdown('verifier'),
      adm: this.committees.roleDropdown('adm'),
      diMd: this.committees.dropdown('DI/MD'),
      ca: this.committees.dropdown('CA'),
    }).subscribe({
      next: (r) => {
        this.itManagers.set(r.itManagers); this.verifiers.set(r.verifiers); this.adm.set(r.adm); this.diMd.set(r.diMd); this.ca.set(r.ca);
        this.applyDefaults();
      },
      error: () => this.errors.set(['Unable to load the approver lists. Check that the DI/MD and CA committees exist (Master Data > Committee).']),
    });
    this.directory.listUsers().subscribe({ next: (res) => { this.users.set(res.data); }, error: () => undefined });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.editId.set(Number(id));
      this.loadExisting(Number(id));
    } else {
      const me = this.auth.currentUser();
      if (me) this.requestedBy.set(me.displayName);
    }
  }

  private loadExisting(id: number): void {
    this.loading.set(true);
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => {
        this.toName.set(r.toName ?? '');
        this.subject.set(r.subject);
        this.requestDate.set(r.requestDate);
        this.requestedBy.set(r.requestedBy);
        this.recommendedBy.set(r.recommendedBy ?? '');
        this.deadline.set(r.deadline ?? '');
        this.receivedFrom.set(r.receivedFrom ?? '');
        this.reasons.set(r.reasonsForPurchase ?? '');
        this.currency.set(r.currency);
        this.rows.set(r.items.length ? r.items.map((i) => ({ item: i.item, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })) : [emptyRow()]);
        this.discount.set(Number(r.discount) || null);
        this.vat.set(r.vat);
        this.paymentTerm.set(r.paymentTerm ?? PR_DEFAULT_PAYMENT_TERM);
        this.otherConditions.set(r.otherConditions ?? '');
        this.quotationAttached.set(r.quotationAttached);
        this.notItEquipment.set(r.notItEquipment);
        this.verifyIsBy.set(r.verifyIsBy ?? '');
        this.verifyBy.set(r.verifyBy ?? '');
        this.approverBy.set(r.approverBy ?? '');
        this.approver2By.set(r.approver2By ?? '');
        this.ackBy.set(r.ackBy ?? '');
        this.actionBy.set(r.actionBy ?? '');
        const rejectedStep = PR_STEPS.find((s) => r[s.status] === 'rejected');
        this.rejection.set(r.status === 'rejected' && rejectedStep
          ? { by: r[rejectedStep.by] as string, label: rejectedStep.label, comment: (r[rejectedStep.comment] as string | null) ?? '' }
          : null);
        this.attachments.set((r.attachments as AttachmentInfo[] | null) ?? []);
      },
      error: (e: HttpErrorResponse) => this.errors.set([e.status === 403 ? 'You do not have access to this record.' : 'Failed to load record.']),
    });
  }

  /** New requests: a step whose list has exactly one person (the IT manager, CA, the purchase admin) is filled in automatically. */
  private applyDefaults(): void {
    if (this.isEdit()) return;
    const fill = (members: EmployeeOption[], value: { (): string; set(v: string): void }) => {
      const eligible = members.map((e) => e.username ?? '').filter(Boolean);
      if (value() && !eligible.includes(value())) value.set('');
      if (!value() && eligible.length === 1) value.set(eligible[0]);
    };
    fill(this.itManagers(), this.verifyIsBy);
    fill(this.ca(), this.ackBy);
    fill(this.adm(), this.actionBy);
  }

  /** "To" is the printed name of the person who approves (Approved By); Approved By 2 does not change it. */
  onApproverChange(username: string): void {
    this.approverBy.set(username);
    const person = this.diMd().find((e) => e.username === username);
    this.toName.set(person ? person.name : '');
  }

  onRequesterChange(name: string): void {
    this.requestedBy.set(name);
    for (const [value, signal] of [[this.approverBy(), this.approverBy], [this.approver2By(), this.approver2By]] as const) {
      const person = this.diMd().find((e) => e.username === value);
      if (person && this.isRequester(person)) signal.set('');
    }
  }

  addRow(): void { this.rows.update((rows) => [...rows, emptyRow()]); }
  removeRow(index: number): void { this.rows.update((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyRow()])); }
  patchRow(index: number, patch: Partial<ItemRow>): void {
    this.rows.update((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  private isRequester(e: EmployeeOption): boolean {
    return !!e.username && this.requesterUsernames().has(e.username.toLowerCase());
  }

  /** People matching `allow`, keeping an already chosen person visible when editing. */
  private options(members: EmployeeOption[], current: string, allow: (e: EmployeeOption) => boolean): SelectOption[] {
    const options = members.filter(allow).map((e) => ({ value: e.username ?? '', label: e.label })).filter((o) => o.value);
    if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
    return options;
  }

  formatAmount(value: number): string {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  save(action: 'draft' | 'submitted'): void {
    if (this.saving()) return;
    this.errors.set([]);
    const text = (value: string) => value.trim() || null;
    const items = this.rows()
      .filter((r) => action === 'submitted' || r.item.trim() || r.description.trim() || r.quantity || r.unitPrice)
      .map((r) => ({ item: r.item.trim(), description: r.description.trim(), quantity: r.quantity ?? 0, unitPrice: r.unitPrice ?? 0 }));
    const payload: SavePurchaseRequisitionPayload = {
      subject: this.subject().trim(),
      toName: text(this.toName()),
      requestDate: this.requestDate(),
      requestedBy: this.requestedBy(),
      recommendedBy: text(this.recommendedBy()),
      deadline: this.deadline() || null,
      receivedFrom: text(this.receivedFrom()),
      reasonsForPurchase: text(this.reasons()),
      currency: this.currency(),
      items,
      discount: this.discountValue(),
      vat: this.vat(),
      paymentTerm: text(this.paymentTerm()),
      otherConditions: text(this.otherConditions()),
      quotationAttached: this.quotationAttached(),
      notItEquipment: this.notItEquipment(),
      verifyIsBy: this.notItEquipment() ? null : this.verifyIsBy() || null,
      verifyBy: this.verifyBy() || null,
      approverBy: this.approverBy() || null,
      approver2By: this.needsApprover2() ? this.approver2By() || null : null,
      ackBy: this.ackBy() || null,
      actionBy: this.actionBy() || null,
      attachments: this.attachments().length ? this.attachments() : null,
      action,
    };
    this.saving.set(true);
    const request = this.isEdit() && this.editId() ? this.service.update(this.editId()!, payload) : this.service.create(payload);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigate(['/procurement/requisitions']),
      error: (e: HttpErrorResponse) => {
        const message = e.error?.message;
        this.errors.set(Array.isArray(message) ? message : [message ?? 'Failed to save.']);
      },
    });
  }
}
