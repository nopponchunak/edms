import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { FuseNavigationItem } from '@fuse/components/navigation';
import { Navigation } from 'app/core/navigation/navigation.types';
import { BehaviorSubject, Observable, ReplaySubject, map, tap } from 'rxjs';
import { NavigationPermissionService } from '../services/navigation-permission.service';

@Injectable({ providedIn: 'root' })
export class NavigationService {
    private _httpClient = inject(HttpClient);
    private _permissionService = inject(NavigationPermissionService);
    private _navigation: ReplaySubject<Navigation> =
        new ReplaySubject<Navigation>(1);
    private readonly _legacyTitleStorageKey =
        'navigation.useLegacyCategoryTitles';
    private readonly _useLegacyCategoryTitles =
        new BehaviorSubject<boolean>(
            this.readLegacyCategoryTitlePreference()
        );
    private _filteredNavigation: Navigation | null = null;

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for navigation
     */
    get navigation$(): Observable<Navigation> {
        return this._navigation.asObservable();
    }

    /**
     * Getter for the sidebar category title mode
     */
    get useLegacyCategoryTitles$(): Observable<boolean> {
        return this._useLegacyCategoryTitles.asObservable();
    }

    /**
     * Getter for the current sidebar category title mode
     */
    get useLegacyCategoryTitles(): boolean {
        return this._useLegacyCategoryTitles.value;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get all navigation data
     */
    get(): Observable<Navigation> {
        return this._httpClient.get<Navigation>('api/common/navigation').pipe(
            map((navigation) => {
                // Filter navigation based on permissions
                return this.filterNavigationByPermissions(navigation);
            }),
            tap((navigation) => {
                this._filteredNavigation = navigation;
            }),
            map((navigation) => {
                return this.applyCategoryTitleMode(navigation);
            }),
            tap((navigation) => {
                this._navigation.next(navigation);
            })
        );
    }

    /**
     * Set the sidebar category title mode
     */
    setUseLegacyCategoryTitles(enabled: boolean): void {
        const useLegacyTitles = !!enabled;

        this.persistLegacyCategoryTitlePreference(useLegacyTitles);
        this._useLegacyCategoryTitles.next(useLegacyTitles);

        if (this._filteredNavigation) {
            this._navigation.next(
                this.applyCategoryTitleMode(this._filteredNavigation)
            );
        }
    }

    /**
     * Filter navigation items based on permissions
     */
    private filterNavigationByPermissions(navigation: Navigation): Navigation {
        return {
            compact: this._permissionService.filterNavigationItems(navigation.compact),
            default: this._permissionService.filterNavigationItems(navigation.default),
            futuristic: this._permissionService.filterNavigationItems(navigation.futuristic),
            horizontal: this._permissionService.filterNavigationItems(navigation.horizontal),
        };
    }

    /**
     * Apply the selected sidebar title mode.
     */
    private applyCategoryTitleMode(navigation: Navigation): Navigation {
        return {
            compact: this.applyTitleModeToItems(navigation.compact),
            default: this.applyTitleModeToItems(navigation.default),
            futuristic: this.applyTitleModeToItems(navigation.futuristic),
            horizontal: this.applyTitleModeToItems(navigation.horizontal),
        };
    }

    private applyTitleModeToItems(
        items: FuseNavigationItem[]
    ): FuseNavigationItem[] {
        return (items ?? []).map((item) => {
            const children = item.children
                ? this.applyTitleModeToItems(item.children)
                : undefined;
            const title = this.useLegacyCategoryTitles
                ? this.getLegacyTitle(item)
                : this.getCodeModeTitle(item);

            if (!title && !children) {
                return item;
            }

            return {
                ...item,
                title: title ?? item.title,
                ...(children ? { children } : {}),
            };
        });
    }

    private getLegacyTitle(item: FuseNavigationItem): string | null {
        return typeof item.meta?.legacyTitle === 'string'
            ? item.meta.legacyTitle
            : null;
    }

    private getCodeModeTitle(item: FuseNavigationItem): string | null {
        if (item.type !== 'basic') {
            return null;
        }

        const code = this.normalizeTitlePart(item.tooltip);
        const title = this.normalizeTitlePart(item.title);

        if (!code || !title || title.startsWith(code)) {
            return null;
        }

        return `${code} ${title}`;
    }

    private normalizeTitlePart(value: unknown): string {
        return typeof value === 'string' ? value.trim() : '';
    }

    private readLegacyCategoryTitlePreference(): boolean {
        try {
            return localStorage.getItem(this._legacyTitleStorageKey) === 'true';
        } catch {
            return false;
        }
    }

    private persistLegacyCategoryTitlePreference(enabled: boolean): void {
        try {
            localStorage.setItem(
                this._legacyTitleStorageKey,
                enabled ? 'true' : 'false'
            );
        } catch {
            // Ignore storage errors; the in-memory toggle still works.
        }
    }
}
