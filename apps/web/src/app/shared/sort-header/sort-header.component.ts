import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface SortState { sort: string; dir: 'asc' | 'desc'; }

/** Clickable column title for sortable tables: put it inside a `<th>`. */
@Component({
  selector: 'app-sort-header',
  standalone: true,
  template: `
    <button type="button" class="sort-btn" [class.active]="active" [attr.aria-label]="'Sort by ' + label" (click)="toggle()">
      <span>{{ label }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m8 10 4-4 4 4" [class.on]="active && dir === 'asc'" />
        <path d="m8 14 4 4 4-4" [class.on]="active && dir === 'desc'" />
      </svg>
    </button>
  `,
  styles: [`
    .sort-btn { display:inline-flex; align-items:center; gap:4px; padding:0; border:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; cursor:pointer; }
    .sort-btn:hover, .sort-btn.active { color:var(--mh-ink); }
    svg { width:12px; height:12px; fill:none; stroke:currentColor; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; opacity:.35; }
    .sort-btn.active svg { opacity:1; }
    path.on { stroke:var(--mh-primary); opacity:1; }
  `],
})
export class SortHeaderComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) key!: string;
  @Input() state: SortState = { sort: '', dir: 'asc' };
  @Output() sortChange = new EventEmitter<SortState>();

  get active(): boolean { return this.state.sort === this.key; }
  get dir(): 'asc' | 'desc' { return this.state.dir; }

  toggle(): void {
    this.sortChange.emit({ sort: this.key, dir: this.active && this.state.dir === 'asc' ? 'desc' : 'asc' });
  }
}
