import {
  Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-searchable-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
})
export class SearchableSelectComponent implements OnChanges {
  @Input() options: SelectOption[] = [];
  @Input() value = '';
  @Input() placeholder = '— Select person —';
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<string>();

  readonly open = signal(false);
  readonly query = signal('');

  constructor(private readonly el: ElementRef) {}

  ngOnChanges() {
    this.query.set('');
  }

  get selectedLabel(): string {
    return this.options.find(o => o.value === this.value)?.label ?? '';
  }

  get filtered(): SelectOption[] {
    const q = this.query().toLowerCase().trim();
    if (!q) return this.options;
    return this.options.filter(o => o.label.toLowerCase().includes(q));
  }

  toggle() {
    if (this.disabled) return;
    this.open.update(v => !v);
    if (this.open()) this.query.set('');
  }

  select(opt: SelectOption) {
    this.valueChange.emit(opt.value);
    this.open.set(false);
    this.query.set('');
  }

  clear() {
    this.valueChange.emit('');
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: Event) {
    if (!this.el.nativeElement.contains(e.target)) {
      this.open.set(false);
    }
  }
}
