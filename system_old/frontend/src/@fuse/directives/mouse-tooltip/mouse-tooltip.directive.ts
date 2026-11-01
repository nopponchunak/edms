import { DOCUMENT } from '@angular/common';
import {
    Directive,
    HostListener,
    Input,
    OnChanges,
    OnDestroy,
    Renderer2,
    inject,
} from '@angular/core';

@Directive({
    selector: '[fuseMouseTooltip]',
    exportAs: 'fuseMouseTooltip',
    standalone: true,
})
export class FuseMouseTooltipDirective implements OnChanges, OnDestroy {
    private _document = inject(DOCUMENT);
    private _renderer2 = inject(Renderer2);

    @Input('fuseMouseTooltip') message: string | null | undefined = '';
    @Input() fuseMouseTooltipShowDelay: number = 2000;

    private _lastMouseEvent: MouseEvent | null = null;
    private _showTimeout: number | null = null;
    private _tooltipEl: HTMLElement | null = null;
    private _visible: boolean = false;

    ngOnChanges(): void {
        if (!this._tooltipMessage) {
            this._hide();
            return;
        }

        if (this._tooltipEl) {
            this._tooltipEl.textContent = this._tooltipMessage;
            this._positionTooltip();
        }
    }

    ngOnDestroy(): void {
        this._hide();
    }

    @HostListener('mouseenter', ['$event'])
    onMouseenter(event: MouseEvent): void {
        this._lastMouseEvent = event;

        if (!this._tooltipMessage) {
            return;
        }

        this._clearShowTimeout();
        this._showTimeout = window.setTimeout(() => {
            this._show();
        }, this.fuseMouseTooltipShowDelay);
    }

    @HostListener('mousemove', ['$event'])
    onMousemove(event: MouseEvent): void {
        this._lastMouseEvent = event;

        if (this._visible) {
            this._positionTooltip();
        }
    }

    @HostListener('mouseleave')
    onMouseleave(): void {
        this._hide();
    }

    @HostListener('blur')
    onBlur(): void {
        this._hide();
    }

    @HostListener('window:scroll')
    onWindowScroll(): void {
        this._hide();
    }

    private get _tooltipMessage(): string {
        return (this.message ?? '').trim();
    }

    private _show(): void {
        this._showTimeout = null;

        if (!this._lastMouseEvent || !this._tooltipMessage) {
            return;
        }

        if (!this._tooltipEl) {
            this._tooltipEl = this._createTooltipElement();
        }

        this._tooltipEl.textContent = this._tooltipMessage;
        this._renderer2.setStyle(this._tooltipEl, 'visibility', 'hidden');
        this._renderer2.appendChild(this._document.body, this._tooltipEl);
        this._visible = true;
        this._positionTooltip();
        this._renderer2.setStyle(this._tooltipEl, 'visibility', 'visible');

        requestAnimationFrame(() => this._positionTooltip());
    }

    private _hide(): void {
        this._clearShowTimeout();
        this._lastMouseEvent = null;
        this._visible = false;

        if (this._tooltipEl?.parentNode) {
            this._renderer2.removeChild(
                this._document.body,
                this._tooltipEl
            );
        }
    }

    private _clearShowTimeout(): void {
        if (this._showTimeout !== null) {
            window.clearTimeout(this._showTimeout);
            this._showTimeout = null;
        }
    }

    private _createTooltipElement(): HTMLElement {
        const tooltipEl = this._renderer2.createElement('div') as HTMLElement;

        this._renderer2.setStyle(tooltipEl, 'position', 'fixed');
        this._renderer2.setStyle(tooltipEl, 'z-index', '10000');
        this._renderer2.setStyle(tooltipEl, 'pointer-events', 'none');
        this._renderer2.setStyle(tooltipEl, 'padding', '4px 8px');
        this._renderer2.setStyle(tooltipEl, 'border-radius', '4px');
        this._renderer2.setStyle(tooltipEl, 'background', '#111827');
        this._renderer2.setStyle(tooltipEl, 'color', '#ffffff');
        this._renderer2.setStyle(tooltipEl, 'font-size', '12px');
        this._renderer2.setStyle(tooltipEl, 'font-weight', '500');
        this._renderer2.setStyle(tooltipEl, 'line-height', '20px');
        this._renderer2.setStyle(tooltipEl, 'white-space', 'nowrap');
        this._renderer2.setStyle(
            tooltipEl,
            'box-shadow',
            '0 4px 12px rgba(15, 23, 42, 0.22)'
        );

        return tooltipEl;
    }

    private _positionTooltip(): void {
        if (!this._tooltipEl || !this._lastMouseEvent) {
            return;
        }

        const margin = 8;
        const offset = 12;
        const viewportWidth =
            this._document.defaultView?.innerWidth ??
            this._document.documentElement.clientWidth;
        const viewportHeight =
            this._document.defaultView?.innerHeight ??
            this._document.documentElement.clientHeight;
        const rect = this._tooltipEl.getBoundingClientRect();
        let left = this._lastMouseEvent.clientX + offset;
        let top = this._lastMouseEvent.clientY + offset;

        if (left + rect.width > viewportWidth - margin) {
            left = this._lastMouseEvent.clientX - rect.width - offset;
        }

        if (top + rect.height > viewportHeight - margin) {
            top = this._lastMouseEvent.clientY - rect.height - offset;
        }

        this._renderer2.setStyle(
            this._tooltipEl,
            'left',
            `${Math.max(margin, left)}px`
        );
        this._renderer2.setStyle(
            this._tooltipEl,
            'top',
            `${Math.max(margin, top)}px`
        );
    }
}
