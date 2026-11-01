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
import { AttachmentInfo } from '../../shared/upload/upload.service';
import { SearchableSelectComponent, SelectOption } from '../../shared/searchable-select/searchable-select.component';
import { STEPS } from './charitable-contribution-steps';
import {
  CharitableContributionService, REQUEST_TYPE_LABELS, RequestType, SaveCharitablePayload,
} from './charitable-contribution.service';

const THRESHOLD = 20000;
const MIN_THB = 2500;
const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'AUD', 'CHF', 'HKD', 'KRW', 'INR', 'VND'];

const isMd = (e: EmployeeOption) => e.level?.trim().toUpperCase() === 'MD' || /managing director/i.test(e.title ?? '');
const isDi = (e: EmployeeOption) => !isMd(e) && (e.level?.trim().toUpperCase() === 'DI' || /^director$/i.test((e.title ?? '').trim()));

@Component({
  selector: 'app-charitable-contribution-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SearchableSelectComponent, FileAttachComponent],
  templateUrl: './charitable-contribution-form.component.html',
  styleUrl: './charitable-contribution-form.component.scss',
})
export class CharitableContributionFormComponent implements OnInit {
  private readonly service = inject(CharitableContributionService);
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

  readonly requestTypes = (Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((value) => ({ value, label: REQUEST_TYPE_LABELS[value] }));
  readonly currencies = CURRENCIES;
  readonly threshold = THRESHOLD;
  readonly minThb = MIN_THB;

  // form values
  readonly requestType = signal<RequestType>('charitable_contribution');
  readonly requesterName = signal('');
  readonly eventDescription = signal('');
  readonly eventPurpose = signal('');
  readonly organizerName = signal('');
  readonly contributionDescription = signal('');
  readonly valueAmount = signal<number | null>(null);
  readonly currency = signal('THB');
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

  private readonly selectedApprover = computed(() => this.diMd().find((e) => e.username === this.approverBy()) ?? null);

  readonly needsApprover2 = computed(() => {
    const approver = this.selectedApprover();
    return this.isThb() && (this.valueAmount() ?? 0) > THRESHOLD && !!approver && isDi(approver);
  });
  // Only when a DI approves a THB request above the threshold (an MD needs no second approver); other currencies opt in.
  readonly showApprover2 = computed(() => this.needsApprover2() || (!this.isThb() && this.useApprover2()));
  readonly canToggleApprover2 = computed(() => !this.isThb());

  private readonly notRequester = (e: EmployeeOption) => !this.isRequester(e);
  readonly verifyOptions = computed(() => this.options(this.acsc(), this.verifyBy(), () => true));
  readonly ack1Options = computed(() => this.options(this.acsl(), this.ack1By(), () => true));
  readonly ack2Options = computed(() => this.options(this.ca(), this.ack2By(), () => true));
  // A DI cannot approve their own request; an MD can.
  readonly approverOptions = computed(() => this.options(this.diMd(), this.approverBy(), (e) => !this.isRequester(e) || isMd(e)));
  readonly approver2Options = computed(() => this.options(
    this.diMd(), this.approver2By(),
    (e) => isDi(e) && !this.isRequester(e) && e.username !== this.approverBy(),
  ));

  readonly approverHint = computed(() => {
    if (!this.isThb()) return 'Foreign currency requests do not use the THB approval rule.';
    return (this.valueAmount() ?? 0) > THRESHOLD
      ? `Above ${THRESHOLD.toLocaleString('en-US')} THB: 1 MD, or 2 DIs.`
      : `Up to ${THRESHOLD.toLocaleString('en-US')} THB: 1 DI or 1 MD.`;
  });

  ngOnInit(): void {
    forkJoin({
      acsc: this.committees.dropdown('ACSC'),
      acsl: this.committees.dropdown('ACSL'),
      diMd: this.committees.dropdown('DI/MD'),
      ca: this.committees.dropdown('CA'),
    }).subscribe({
      next: (r) => { this.acsc.set(r.acsc); this.acsl.set(r.acsl); this.diMd.set(r.diMd); this.ca.set(r.ca); this.applyDefaults(); },
      error: () => this.errors.set(['Unable to load the approver lists. Check that the ACSC, ACSL, DI/MD and CA committees exist.']),
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
        this.eventDescription.set(r.eventDescription ?? '');
        this.eventPurpose.set(r.eventPurpose ?? '');
        this.organizerName.set(r.organizerName);
        this.contributionDescription.set(r.contributionDescription ?? '');
        this.valueAmount.set(Number(r.valueAmount));
        this.currency.set(r.currency);
        this.proposedDate.set(r.proposedDate);
        this.verifyBy.set(r.verifyBy ?? '');
        this.ack1By.set(r.ack1By ?? '');
        this.approverBy.set(r.approverBy ?? '');
        this.approver2By.set(r.approver2By ?? '');
        this.useApprover2.set(!!r.approver2By);
        this.ack2By.set(r.ack2By ?? '');
        const rejectedStep = STEPS.find((s) => r[s.status] === 'rejected');
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
    this.applyDefaults();
  }

  /**
   * New requests: a step whose committee has exactly one eligible member is filled in automatically
   * (ACSC, ACSL and CA today). The requester may also be one of these people.
   */
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
    const payload: SaveCharitablePayload = {
      requestType: this.requestType(),
      requesterName: this.requesterName(),
      eventDescription: text(this.eventDescription()),
      eventPurpose: text(this.eventPurpose()),
      organizerName: this.organizerName().trim(),
      contributionDescription: text(this.contributionDescription()),
      valueAmount: Number(this.valueAmount()) || 0,
      currency: this.currency(),
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
      next: () => void this.router.navigate(['/anti-corruption/charitable-contribution']),
      error: (e: HttpErrorResponse) => {
        const message = e.error?.message;
        this.errors.set(Array.isArray(message) ? message : [message ?? 'Failed to save.']);
      },
    });
  }
}
