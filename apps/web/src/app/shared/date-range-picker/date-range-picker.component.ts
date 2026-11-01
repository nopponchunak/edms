import { Component, computed, ElementRef, EventEmitter, HostListener, inject, Input, Output, signal } from '@angular/core';

export interface DateRange {
  from: string;
  to: string;
}

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  today: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (value: number) => String(value).padStart(2, '0');
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  templateUrl: './date-range-picker.component.html',
  styleUrl: './date-range-picker.component.scss',
})
export class DateRangePickerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() set from(value: string) { this.committedFrom.set(value ?? ''); }
  @Input() set to(value: string) { this.committedTo.set(value ?? ''); }
  @Input() placeholder = 'Select dates';
  @Output() rangeChange = new EventEmitter<DateRange>();

  readonly weekdays = WEEKDAYS;
  readonly open = signal(false);
  private readonly committedFrom = signal('');
  private readonly committedTo = signal('');
  readonly start = signal('');
  readonly end = signal('');
  readonly hover = signal('');
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());

  readonly label = computed(() => {
    const from = this.committedFrom();
    const to = this.committedTo();
    if (!from && !to) return '';
    const fmt = (iso: string) => iso.split('-').reverse().join('/');
    return from === to || !to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  });
  readonly hasValue = computed(() => !!this.committedFrom() || !!this.committedTo());
  readonly title = computed(() => `${MONTHS[this.viewMonth()]} ${this.viewYear()}`);

  readonly cells = computed<DayCell[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const first = new Date(year, month, 1);
    const todayIso = toIso(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, 1 - first.getDay() + index);
      const iso = toIso(date);
      return { iso, day: date.getDate(), inMonth: date.getMonth() === month, today: iso === todayIso };
    });
  });

  toggle(): void {
    if (this.open()) { this.open.set(false); return; }
    this.start.set(this.committedFrom());
    this.end.set(this.committedTo());
    const anchor = this.committedFrom() ? new Date(`${this.committedFrom()}T00:00:00`) : new Date();
    this.viewYear.set(anchor.getFullYear());
    this.viewMonth.set(anchor.getMonth());
    this.hover.set('');
    this.open.set(true);
  }

  shiftMonth(delta: number): void {
    const date = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(date.getFullYear());
    this.viewMonth.set(date.getMonth());
  }

  pick(iso: string): void {
    if (!this.start() || this.end()) {
      this.start.set(iso);
      this.end.set('');
      return;
    }
    const [from, to] = iso < this.start() ? [iso, this.start()] : [this.start(), iso];
    this.start.set(from);
    this.end.set(to);
    this.commit(from, to);
  }

  isEdge(iso: string): boolean { return iso === this.start() || iso === this.end(); }

  inRange(iso: string): boolean {
    const start = this.start();
    const stop = this.end() || this.hover();
    if (!start || !stop) return false;
    const [low, high] = start <= stop ? [start, stop] : [stop, start];
    return iso > low && iso < high;
  }

  preset(kind: 'today' | 'week' | 'month'): void {
    const now = new Date();
    const to = toIso(now);
    const from = kind === 'today' ? to
      : kind === 'week' ? toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
        : toIso(new Date(now.getFullYear(), now.getMonth(), 1));
    this.commit(from, to);
  }

  clear(): void {
    this.commit('', '');
  }

  private commit(from: string, to: string): void {
    this.committedFrom.set(from);
    this.committedTo.set(to);
    this.open.set(false);
    this.rangeChange.emit({ from, to });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.open.set(false); }
}
