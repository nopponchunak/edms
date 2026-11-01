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
  GiftOfferingService, MIN_OFFERING_VALUE, OFFERING_TIER_2, OFFERING_TIER_3, OFFERING_TYPE_LABELS, OfferingRequestType, SaveGiftOfferingPayload,
} from './gift-offering.service';
import { OFFERING_STEPS } from './gift-offering-steps';

const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CHF', 'HKD', 'KRW', 'INR', 'VND'];

const isMd = (e: EmployeeOption) => e.level?.trim().toUpperCase() === 'MD' || /managing director/i.test(e.title ?? '');
const isDi = (e: EmployeeOption) => !isMd(e) && (e.level?.trim().toUpperCase() === 'DI' || /^director$/i.test((e.title ?? '').trim()));

@Component({
  selector: 'app-gift-offering-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, FileAttachComponent],
  templateUrl: './gift-offering-form.component.html',
  styleUrl: './gift-offering-form.component.scss',
})
export class GiftOfferingFormComponent implements OnInit {
  private readonly service = inject(GiftOfferingService);
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

  readonly requestTypes = (Object.keys(OFFERING_TYPE_LABELS) as OfferingRequestType[]).map((value) => ({ value, label: OFFERING_TYPE_LABELS[value] }));
  readonly currencies = CURRENCIES;
  readonly minValue = MIN_OFFERING_VALUE;
  readonly tier2 = OFFERING_TIER_2;
  readonly tier3 = OFFERING_TIER_3;

  // form values
  readonly requestType = signal<OfferingRequestType>('gift');
  readonly requesterName = signal('');
  readonly description = signal('');
  readonly purpose = signal('');
  readonly valueAmount = signal<number | null>(null);
  readonly currency = signal('THB');
  readonly receiverNameCompany = signal('');
  readonly proposedDate = signal(new Date().toISOString().slice(0, 10));
  readonly verifyBy = signal('');
  readonly ack1By = signal('');
  readonly approverBy = signal('');
  readonly useApprover2 = signal(false);
  readonly approver2By = signal('');
  readonly ack2By = signal('');
  readonly attachments = signal<AttachmentInfo[]>([]);

  // committee members per step
  private readonly acsc = signal<EmployeeOption[]>([]);
  private readonly acsl = signal<EmployeeOption[]>([]);
  private readonly diMd = signal<EmployeeOption[]>([]);
  private readonly ca = signal<EmployeeOption[]>([]);
  readonly users = signal<DirectoryUser[]>([]);

  readonly isThb = computed(() => this.currency() === 'THB');
  private readonly amount = computed(() => this.valueAmount() ?? 0);
  /** Above 30,000 THB an MD and a DI approve together. */
  readonly needsApprover2 = computed(() => this.isThb() && this.amount() > OFFERING_TIER_3);
  readonly showApprover2 = computed(() => this.needsApprover2() || (!this.isThb() && this.useApprover2()));
  readonly canToggleApprover2 = computed(() => !this.isThb());

  readonly userOptions = computed<SelectOption[]>(() => {
    const options = this.users().map((u) => ({ value: u.displayName, label: u.displayName }));
    const extra = [this.auth.currentUser()?.displayName, this.requesterName()]
      .filter((name): name is string => !!name && !options.some((o) => o.value === name))
      .map((name) => ({ value: name, label: name }));
    return [...new Map([...extra, ...options].map((o) => [o.value, o])).values()];
  });

  /** Usernames that identify the requester, so they can be kept out of the approver lists. */
  private readonly requesterUsernames = computed(() => {
    const name = this.requesterName();
    const names = new Set(this.users().filter((u) => u.displayName === name).map((u) => u.username.toLowerCase()));
    const me = this.auth.currentUser();
    if (me && me.displayName === name) names.add(me.username.toLowerCase());
    return names;
  });

  // The requester may verify or acknowledge their own request, but nobody may approve it for themselves.
  readonly verifyOptions = computed(() => this.options(this.acsc(), this.verifyBy(), () => true));
  readonly ack1Options = computed(() => this.options(this.acsl(), this.ack1By(), () => true));
  readonly ack2Options = computed(() => this.options(this.ca(), this.ack2By(), () => true));
  readonly approverOptions = computed(() => this.options(
    this.diMd(), this.approverBy(),
    // Above 30,000 THB the first approver is the MD; otherwise a DI or an MD.
    (e) => !this.isRequester(e) && (!this.needsApprover2() || isMd(e)),
  ));
  readonly approver2Options = computed(() => this.options(
    this.diMd(), this.approver2By(),
    (e) => isDi(e) && !this.isRequester(e) && e.username !== this.approverBy(),
  ));

  /** Who may request and who approves, for the amount entered. */
  readonly tierHint = computed(() => {
    if (!this.isThb()) return 'Foreign currency requests do not use the THB amount rules.';
    const amount = this.amount();
    if (amount > OFFERING_TIER_3) return `Above ${OFFERING_TIER_3.toLocaleString('en-US')} THB: requested by an MD, approved by an MD and a DI together.`;
    if (amount > OFFERING_TIER_2) return `Above ${OFFERING_TIER_2.toLocaleString('en-US')} up to ${OFFERING_TIER_3.toLocaleString('en-US')} THB: requested by a DI or MD, approved by 1 DI or MD.`;
    if (amount > MIN_OFFERING_VALUE) return `Above ${MIN_OFFERING_VALUE.toLocaleString('en-US')} up to ${OFFERING_TIER_2.toLocaleString('en-US')} THB: requested by EE level or above, approved by 1 DI or MD.`;
    return `Offering requests start above ${MIN_OFFERING_VALUE.toLocaleString('en-US')} THB.`;
  });

  ngOnInit(): void {
    forkJoin({
      acsc: this.committees.dropdown('ACSC'),
      acsl: this.committees.dropdown('ACSL'),
      diMd: this.committees.dropdown('DI/MD'),
      ca: this.committees.dropdown('CA'),
    }).subscribe({
      next: (r) => { this.acsc.set(r.acsc); this.acsl.set(r.acsl); this.diMd.set(r.diMd); this.ca.set(r.ca); this.applyDefaults(); },
      error: () => this.errors.set(['Unable to load the approver lists. Check that the ACSC, ACSL, DI/MD and CA committees exist (Master Data > Committee).']),
    });
    this.directory.listUsers().subscribe({ next: (res) => { this.users.set(res.data); this.applyDefaults(); }, error: () => undefined });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit.set(true);
      this.editId.set(Number(id));
      this.loadExisting(Number(id));
    } else {
      const me = this.auth.currentUser();
      if (me) this.requesterName.set(me.displayName);
    }
  }

  private loadExisting(id: number): void {
    this.loading.set(true);
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (r) => {
        this.requestType.set(r.requestType);
        this.requesterName.set(r.requesterName);
        this.description.set(r.description ?? '');
        this.purpose.set(r.purpose ?? '');
        this.valueAmount.set(Number(r.valueAmount));
        this.currency.set(r.currency);
        this.receiverNameCompany.set(r.receiverNameCompany);
        this.proposedDate.set(r.proposedDate);
        this.verifyBy.set(r.verifyBy ?? '');
        this.ack1By.set(r.ack1By ?? '');
        this.approverBy.set(r.approverBy ?? '');
        this.approver2By.set(r.approver2By ?? '');
        this.useApprover2.set(!!r.approver2By);
        this.ack2By.set(r.ack2By ?? '');
        const rejectedStep = OFFERING_STEPS.find((s) => r[s.status] === 'rejected');
        this.rejection.set(r.status === 'rejected' && rejectedStep
          ? { by: r[rejectedStep.by] as string, label: rejectedStep.label, comment: (r[rejectedStep.comment] as string | null) ?? '' }
          : null);
        this.attachments.set((r.attachments as AttachmentInfo[] | null) ?? []);
      },
      error: (e: HttpErrorResponse) => this.errors.set([e.status === 403 ? 'You do not have access to this record.' : 'Failed to load record.']),
    });
  }

  onRequesterChange(name: string): void {
    this.requesterName.set(name);
    // An approver who turns out to be the requester is no longer allowed.
    for (const [value, signal] of [[this.approverBy(), this.approverBy], [this.approver2By(), this.approver2By]] as const) {
      const person = this.diMd().find((e) => e.username === value);
      if (person && this.isRequester(person)) signal.set('');
    }
  }

  /** New requests: a step whose committee has exactly one member is filled in automatically (ACSC, ACSL and CA when they have one person). */
  private applyDefaults(): void {
    if (this.isEdit()) return;
    const fill = (members: EmployeeOption[], value: { (): string; set(v: string): void }) => {
      const eligible = members.map((e) => e.username ?? '').filter(Boolean);
      if (value() && !eligible.includes(value())) value.set('');
      if (!value() && eligible.length === 1) value.set(eligible[0]);
    };
    fill(this.acsc(), this.verifyBy);
    fill(this.acsl(), this.ack1By);
    fill(this.ca(), this.ack2By);
  }

  private isRequester(e: EmployeeOption): boolean {
    return !!e.username && this.requesterUsernames().has(e.username.toLowerCase());
  }

  /** Committee members matching `allow`, keeping an already chosen person visible when editing. */
  private options(members: EmployeeOption[], current: string, allow: (e: EmployeeOption) => boolean): SelectOption[] {
    const options = members.filter(allow).map((e) => ({ value: e.username ?? '', label: e.label })).filter((o) => o.value);
    if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
    return options;
  }

  save(action: 'draft' | 'submitted'): void {
    if (this.saving()) return;
    this.errors.set([]);
    const text = (value: string) => value.trim() || null;
    const payload: SaveGiftOfferingPayload = {
      requestType: this.requestType(),
      requesterName: this.requesterName(),
      description: text(this.description()),
      purpose: text(this.purpose()),
      valueAmount: Number(this.valueAmount()) || 0,
      currency: this.currency(),
      receiverNameCompany: this.receiverNameCompany().trim(),
      proposedDate: this.proposedDate(),
      verifyBy: this.verifyBy() || null,
      ack1By: this.ack1By() || null,
      approverBy: this.approverBy() || null,
      approver2By: this.showApprover2() ? this.approver2By() || null : null,
      ack2By: this.ack2By() || null,
      attachments: this.attachments().length ? this.attachments() : null,
      action,
    };
    this.saving.set(true);
    const request = this.isEdit() && this.editId() ? this.service.update(this.editId()!, payload) : this.service.create(payload);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => void this.router.navigate(['/anti-corruption/gift-hospitality-offering']),
      error: (e: HttpErrorResponse) => {
        const message = e.error?.message;
        this.errors.set(Array.isArray(message) ? message : [message ?? 'Failed to save.']);
      },
    });
  }
}
