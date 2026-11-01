import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';

@Component({
  selector: 'app-view-actions',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './view-actions.component.html',
})
export class ViewActionsComponent implements OnInit {
  @Input() backPath: string = '';
  @Input() navId: string = '';
  @Input() showPrint: boolean = true;
  @Input() showSecondaryPrint: boolean = false;
  @Input() showEdit: boolean = true;
  @Input() editPath: string = '';
  @Input() printLabel: string = 'Print';
  @Input() secondaryPrintLabel: string = 'Preview';
  @Input() secondaryPrintIcon: string = 'heroicons_outline:eye';

  @Output() print = new EventEmitter<void>();
  @Output() secondaryPrint = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();

  hasEditPermission: boolean = false;

  constructor(
    private _router: Router,
    private _navigationPermissionService: NavigationPermissionService
  ) {}

  ngOnInit(): void {
    if (this.navId) {
      this.hasEditPermission = this._navigationPermissionService.hasEditPermissionByNavId(this.navId);
    } else {
      // Default to true if no navId provided, to maintain existing behavior
      this.hasEditPermission = true;
    }
  }

  onBack(): void {
    if (this.backPath) {
      this._router.navigate([this.backPath]);
    }
  }

  onPrint(): void {
    this.print.emit();
  }

  onSecondaryPrint(): void {
    this.secondaryPrint.emit();
  }

  onEdit(): void {
    if (this.editPath) {
      this._router.navigate([this.editPath]);
    } else {
      this.edit.emit();
    }
  }
}
