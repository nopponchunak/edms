import {
    AfterContentInit,
    ContentChildren,
    Directive,
    ElementRef,
    EventEmitter,
    forwardRef,
    HostListener,
    Input,
    NgModule,
    OnDestroy,
    Output,
    QueryList,
    Renderer2,
} from '@angular/core';

export type ListSortDirection = 'asc' | 'desc';

export interface ListSortEvent {
    column: number;
    dir: ListSortDirection;
}

interface SortableRow {
    element: HTMLTableRowElement;
    originalIndex: number;
    value: string;
}

/** Sorts the exact values rendered in a list table, including derived labels. */
@Directive({ selector: 'table[appListTableSort]', standalone: false })
export class ListTableSortDirective implements AfterContentInit, OnDestroy {
    @Input() appListTableServerSort = false;
    @Input() set appListTableSortState(value: ListSortEvent | null) {
        this.requestedState = value;
        this.applyRequestedState();
    }
    @Output() listSortChange = new EventEmitter<ListSortEvent>();

    @ContentChildren(forwardRef(() => ListSortHeaderDirective), {
        descendants: true,
    })
    private headers!: QueryList<ListSortHeaderDirective>;

    private activeHeader: ListSortHeaderDirective | null = null;
    private direction: ListSortDirection = 'asc';
    private requestedState: ListSortEvent | null = null;
    private headersChangeSubscription?: { unsubscribe(): void };

    constructor(private readonly host: ElementRef<HTMLTableElement>) {}

    ngAfterContentInit(): void {
        this.connectHeaders();
        this.headersChangeSubscription = this.headers.changes.subscribe(() =>
            this.connectHeaders()
        );
    }

    ngOnDestroy(): void {
        this.headersChangeSubscription?.unsubscribe();
    }

    sortBy(header: ListSortHeaderDirective): void {
        if (this.activeHeader === header) {
            this.direction = this.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.activeHeader = header;
            this.direction = 'asc';
        }
        this.updateHeaderStates();

        const column = this.getColumnIndex(header);
        if (column < 0) return;

        this.listSortChange.emit({ column, dir: this.direction });
        if (this.appListTableServerSort) return;

        this.applySort();
    }

    private connectHeaders(): void {
        this.headers.forEach((header) => header.connect(this));
        this.applyRequestedState();
    }

    private applyRequestedState(): void {
        if (!this.headers) return;

        if (this.requestedState) {
            this.activeHeader =
                this.headers.get(this.requestedState.column) ?? null;
            this.direction = this.requestedState.dir;
        }

        this.updateHeaderStates();
    }

    private updateHeaderStates(): void {
        this.headers.forEach((header) =>
            header.setSortState(
                header === this.activeHeader ? this.direction : null
            )
        );
    }

    private applySort(): void {
        const headerElement = this.activeHeader?.element;
        if (!headerElement) return;

        const table = this.host.nativeElement;
        const columnIndex = this.getColumnIndex(this.activeHeader);
        const body = table.tBodies.item(0);
        if (!body || columnIndex < 0) return;

        const rows: SortableRow[] = Array.from(body.rows).map(
            (element, originalIndex) => ({
                element,
                originalIndex,
                value: element.cells.item(columnIndex)?.textContent?.trim() ?? '',
            })
        );
        if (rows.length < 2) return;

        const multiplier = this.direction === 'asc' ? 1 : -1;
        rows.sort((left, right) => {
            const result = compareListTableValues(left.value, right.value);
            return result === 0
                ? left.originalIndex - right.originalIndex
                : result * multiplier;
        });

        const fragment = document.createDocumentFragment();
        rows.forEach(({ element }) => fragment.appendChild(element));
        body.appendChild(fragment);
    }

    private getColumnIndex(header: ListSortHeaderDirective): number {
        const headerCells = Array.from(
            header.element.parentElement?.querySelectorAll('th') ?? []
        );
        return headerCells.indexOf(header.element);
    }
}

@Directive({ selector: 'th[appListSortHeader]', standalone: false })
export class ListSortHeaderDirective implements OnDestroy {
    private tableSort: ListTableSortDirective | null = null;
    private indicator: HTMLSpanElement;

    get element(): HTMLTableCellElement {
        return this.host.nativeElement;
    }

    constructor(
        private readonly host: ElementRef<HTMLTableCellElement>,
        renderer: Renderer2
    ) {
        const element = this.host.nativeElement;
        renderer.setAttribute(element, 'role', 'button');
        renderer.setAttribute(element, 'tabindex', '0');
        renderer.setAttribute(element, 'aria-sort', 'none');
        renderer.addClass(element, 'list-sort-header');

        this.indicator = renderer.createElement('span');
        renderer.addClass(this.indicator, 'list-sort-header__indicator');
        renderer.setAttribute(this.indicator, 'aria-hidden', 'true');
        renderer.appendChild(element, this.indicator);
    }

    ngOnDestroy(): void {
        this.tableSort = null;
    }

    connect(tableSort: ListTableSortDirective): void {
        this.tableSort = tableSort;
    }

    setSortState(direction: ListSortDirection | null): void {
        this.host.nativeElement.setAttribute(
            'aria-sort',
            direction === 'asc'
                ? 'ascending'
                : direction === 'desc'
                  ? 'descending'
                  : 'none'
        );
        this.indicator.textContent =
            direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '⇅';
    }

    @HostListener('click')
    onClick(): void {
        this.tableSort?.sortBy(this);
    }

    @HostListener('keydown.enter', ['$event'])
    @HostListener('keydown.space', ['$event'])
    onKeyboardSort(event: Event): void {
        event.preventDefault();
        this.tableSort?.sortBy(this);
    }
}

@NgModule({
    declarations: [ListTableSortDirective, ListSortHeaderDirective],
    exports: [ListTableSortDirective, ListSortHeaderDirective],
})
export class ListTableSortModule {}

export function compareListTableValues(left: string, right: string): number {
    const leftValue = normalizeComparableValue(left);
    const rightValue = normalizeComparableValue(right);
    if (leftValue.rank !== rightValue.rank) return leftValue.rank - rightValue.rank;
    if (typeof leftValue.value === 'number' && typeof rightValue.value === 'number') {
        return leftValue.value - rightValue.value;
    }
    return String(leftValue.value).localeCompare(String(rightValue.value), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}

function normalizeComparableValue(value: string): {
    rank: number;
    value: string | number;
} {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized || normalized === '-') return { rank: 2, value: '' };

    const numeric = normalized
        .replace(/[฿$€£,%]/g, '')
        .replace(/\s/g, '')
        .replace(/,/g, '');
    if (/^[+-]?\d+(?:\.\d+)?$/.test(numeric)) {
        return { rank: 0, value: Number(numeric) };
    }

    const dateValue = parseDisplayDate(normalized);
    if (dateValue !== null) return { rank: 0, value: dateValue };
    return { rank: 1, value: normalized };
}

function parseDisplayDate(value: string): number | null {
    const match = value.match(
        /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (!match) return null;

    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);
    const year = match[1].length === 4 ? first : third;
    const month = second;
    const day = match[1].length === 4 ? third : first;
    const timestamp = Date.UTC(
        year,
        month - 1,
        day,
        Number(match[4] ?? 0),
        Number(match[5] ?? 0),
        Number(match[6] ?? 0)
    );
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
        ? timestamp
        : null;
}
