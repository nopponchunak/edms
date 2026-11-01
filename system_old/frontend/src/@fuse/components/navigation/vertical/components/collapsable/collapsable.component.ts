import { BooleanInput } from '@angular/cdk/coercion';
import { NgClass } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    HostBinding,
    Input,
    OnDestroy,
    OnInit,
    forwardRef,
    inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router } from '@angular/router';
import { fuseAnimations } from '@fuse/animations';
import { FuseNavigationService } from '@fuse/components/navigation/navigation.service';
import { FuseNavigationItem } from '@fuse/components/navigation/navigation.types';
import { FuseVerticalNavigationBasicItemComponent } from '@fuse/components/navigation/vertical/components/basic/basic.component';
import { FuseVerticalNavigationDividerItemComponent } from '@fuse/components/navigation/vertical/components/divider/divider.component';
import { FuseVerticalNavigationGroupItemComponent } from '@fuse/components/navigation/vertical/components/group/group.component';
import { FuseVerticalNavigationSpacerItemComponent } from '@fuse/components/navigation/vertical/components/spacer/spacer.component';
import { FuseVerticalNavigationComponent } from '@fuse/components/navigation/vertical/vertical.component';
import { FuseMouseTooltipDirective } from '@fuse/directives/mouse-tooltip';
import { Subject, filter, takeUntil } from 'rxjs';

@Component({
    selector: 'fuse-vertical-navigation-collapsable-item',
    templateUrl: './collapsable.component.html',
    animations: fuseAnimations,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        NgClass,
        FuseMouseTooltipDirective,
        MatIconModule,
        FuseVerticalNavigationBasicItemComponent,
        forwardRef(() => FuseVerticalNavigationCollapsableItemComponent),
        FuseVerticalNavigationDividerItemComponent,
        FuseVerticalNavigationGroupItemComponent,
        FuseVerticalNavigationSpacerItemComponent,
    ],
})
export class FuseVerticalNavigationCollapsableItemComponent
    implements OnInit, OnDestroy
{
    /* eslint-disable @typescript-eslint/naming-convention */
    static ngAcceptInputType_autoCollapse: BooleanInput;
    /* eslint-enable @typescript-eslint/naming-convention */

    private _changeDetectorRef = inject(ChangeDetectorRef);
    private _router = inject(Router);
    private _fuseNavigationService = inject(FuseNavigationService);

    @Input() autoCollapse: boolean;
    @Input() item: FuseNavigationItem;
    @Input() name: string;

    isCollapsed: boolean = true;
    isExpanded: boolean = false;
    private _fuseVerticalNavigationComponent: FuseVerticalNavigationComponent;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Host binding for component classes
     */
    @HostBinding('class') get classList(): any {
        /* eslint-disable @typescript-eslint/naming-convention */
        return {
            'fuse-vertical-navigation-item-collapsed': this.isCollapsed,
            'fuse-vertical-navigation-item-expanded': this.isExpanded,
        };
        /* eslint-enable @typescript-eslint/naming-convention */
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Get the parent navigation component
        this._fuseVerticalNavigationComponent =
            this._fuseNavigationService.getComponent(this.name);

        // If the item has a children that has a matching url with the current url, expand...
        if (this._hasActiveChild(this.item, this._router.url)) {
            this.expand();
        }
        // Otherwise...
        else {
            // Always collapse when not active (even if autoCollapse is off)
            // This ensures only one section is open at a time
            this.collapse();
        }

        // Listen for the onCollapsableItemCollapsed from the service
        this._fuseVerticalNavigationComponent.onCollapsableItemCollapsed
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((collapsedItem) => {
                // Check if the collapsed item is null
                if (collapsedItem === null) {
                    return;
                }

                // Collapse if this is a children of the collapsed item
                if (this._isChildrenOf(collapsedItem, this.item)) {
                    this.collapse();
                }
            });

        // Listen for the onCollapsableItemExpanded from the service
        // Always collapse other items when one is expanded (regardless of autoCollapse setting)
        this._fuseVerticalNavigationComponent.onCollapsableItemExpanded
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((expandedItem) => {
                // Check if the expanded item is null
                if (expandedItem === null) {
                    return;
                }

                // Check if this is the expanded item itself - don't collapse it
                if (this.item === expandedItem) {
                    return;
                }

                // Check if this is a parent of the expanded item - keep parent expanded
                if (this._isChildrenOf(this.item, expandedItem)) {
                    return;
                }

                // Check if this has an active child (current page is inside this section) - keep it expanded
                if (this._hasActiveChild(this.item, this._router.url)) {
                    return;
                }

                // Collapse this item if it's not related to the expanded item
                // This ensures only one section is open at a time, regardless of nesting level
                if (!this._isRelated(this.item, expandedItem)) {
                    this.collapse();
                }
            });

        // Attach a listener to the NavigationEnd event
        this._router.events
            .pipe(
                filter(
                    (event): event is NavigationEnd =>
                        event instanceof NavigationEnd
                ),
                takeUntil(this._unsubscribeAll)
            )
            .subscribe((event: NavigationEnd) => {
                // If the item has a children that has a matching url with the current url, expand...
                if (this._hasActiveChild(this.item, event.urlAfterRedirects)) {
                    this.expand();
                }
                // Otherwise...
                else {
                    // Always collapse when navigating to a different section (even if autoCollapse is off)
                    // This ensures only one section is open at a time
                    this.collapse();
                }
            });

        // Subscribe to onRefreshed on the navigation component
        this._fuseVerticalNavigationComponent.onRefreshed
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(() => {
                // Mark for check
                this._changeDetectorRef.markForCheck();
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Collapse
     */
    collapse(): void {
        // Return if the item is disabled
        if (this.item.disabled) {
            return;
        }

        // Return if the item is already collapsed
        if (this.isCollapsed) {
            return;
        }

        // Collapse it
        this.isCollapsed = true;
        this.isExpanded = !this.isCollapsed;

        // Mark for check
        this._changeDetectorRef.markForCheck();

        // Execute the observable
        this._fuseVerticalNavigationComponent.onCollapsableItemCollapsed.next(
            this.item
        );
    }

    /**
     * Expand
     */
    expand(): void {
        // Return if the item is disabled
        if (this.item.disabled) {
            return;
        }

        // Return if the item is already expanded
        if (!this.isCollapsed) {
            return;
        }

        // Expand it
        this.isCollapsed = false;
        this.isExpanded = !this.isCollapsed;

        // Mark for check
        this._changeDetectorRef.markForCheck();

        // Execute the observable
        this._fuseVerticalNavigationComponent.onCollapsableItemExpanded.next(
            this.item
        );
    }

    /**
     * Toggle collapsable
     */
    toggleCollapsable(): void {
        // Toggle collapse/expand
        if (this.isCollapsed) {
            this.expand();
        } else {
            this.collapse();
        }
    }

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Check if the given item has the given url
     * in one of its children
     *
     * @param item
     * @param currentUrl
     * @private
     */
    private _hasActiveChild(
        item: FuseNavigationItem,
        currentUrl: string
    ): boolean {
        const children = item.children;

        if (!children) {
            return false;
        }

        for (const child of children) {
            if (child.children) {
                if (this._hasActiveChild(child, currentUrl)) {
                    return true;
                }
            }

            // Check if the child has a link and is active
            if (
                child.link &&
                this._router.isActive(child.link, child.exactMatch || false)
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if this is a children
     * of the given item
     *
     * @param parent
     * @param item
     * @private
     */
    private _isChildrenOf(
        parent: FuseNavigationItem,
        item: FuseNavigationItem
    ): boolean {
        const children = parent.children;

        if (!children) {
            return false;
        }

        if (children.indexOf(item) > -1) {
            return true;
        }

        for (const child of children) {
            if (child.children) {
                if (this._isChildrenOf(child, item)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if two items are siblings (have the same parent)
     *
     * @param item1
     * @param item2
     * @param navigation
     * @private
     */
    private _areSiblings(
        item1: FuseNavigationItem,
        item2: FuseNavigationItem,
        navigation: FuseNavigationItem[]
    ): boolean {
        const parent1 = this._findParent(item1, navigation);
        const parent2 = this._findParent(item2, navigation);

        // If both have the same parent, they are siblings
        if (parent1 && parent2 && parent1 === parent2) {
            return true;
        }

        // If both are top-level items (no parent), they are siblings
        if (!parent1 && !parent2) {
            return true;
        }

        return false;
    }

    /**
     * Find the parent of an item in the navigation tree
     *
     * @param item
     * @param navigation
     * @param parent
     * @private
     */
    private _findParent(
        item: FuseNavigationItem,
        navigation: FuseNavigationItem[],
        parent: FuseNavigationItem | null = null
    ): FuseNavigationItem | null {
        for (const navItem of navigation) {
            if (navItem === item) {
                return parent;
            }

            if (navItem.children) {
                const found = this._findParent(item, navItem.children, navItem);
                if (found !== null) {
                    return found;
                }
            }
        }

        return null;
    }

    /**
     * Check if an item is a top-level item (no parent)
     *
     * @param item
     * @param navigation
     * @private
     */
    private _isTopLevelItem(
        item: FuseNavigationItem,
        navigation: FuseNavigationItem[]
    ): boolean {
        return navigation.indexOf(item) > -1;
    }

    /**
     * Check if two items are related (one is parent/child of the other)
     *
     * @param item1
     * @param item2
     * @private
     */
    private _isRelated(
        item1: FuseNavigationItem,
        item2: FuseNavigationItem
    ): boolean {
        return (
            this._isChildrenOf(item1, item2) ||
            this._isChildrenOf(item2, item1)
        );
    }
}
