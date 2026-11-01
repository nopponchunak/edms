import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NavigationPermissionService } from 'app/core/services/navigation-permission.service';

interface TenderCategoryOption {
  title: string;
  subtitle: string;
  icon: string;
  link: string;
  newLink: string;
  permissionNavId: string;
  accent: string;
}

@Component({
  selector: 'app-tender-review-category',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './tender-review-category.component.html',
  styleUrls: ['./tender-review-category.component.scss'],
})
export class TenderReviewCategoryComponent {
  private readonly router = inject(Router);
  readonly navigationPermissionService = inject(NavigationPermissionService);

  readonly options: TenderCategoryOption[] = [
    {
      title: 'Tender Review CSA',
      subtitle: 'CSA / Review',
      icon: 'assignment',
      link: '/tender/csa/review',
      newLink: '/tender/csa/review/new',
      permissionNavId: 'tender-csa-review',
      accent: 'tender-option--csa',
    },
    {
      title: 'Tender Verification CSA',
      subtitle: 'CSA / Verification',
      icon: 'verified',
      link: '/tender/csa/verification',
      newLink: '/tender/csa/verification/new',
      permissionNavId: 'tender-csa-verification',
      accent: 'tender-option--csa',
    },
    {
      title: 'Tender Review MEP',
      subtitle: 'MEP / Review',
      icon: 'engineering',
      link: '/tender/mep/review',
      newLink: '/tender/mep/review/new',
      permissionNavId: 'tender-mep-review',
      accent: 'tender-option--mep',
    },
    {
      title: 'Tender Verification MEP',
      subtitle: 'MEP / Verification',
      icon: 'fact_check',
      link: '/tender/mep/verification',
      newLink: '/tender/mep/verification/new',
      permissionNavId: 'tender-mep-verification',
      accent: 'tender-option--mep',
    },
  ];

  get visibleOptions(): TenderCategoryOption[] {
    return this.options.filter((option) =>
      this.navigationPermissionService.hasViewPermissionByNavId(option.permissionNavId)
    );
  }

  canCreate(option: TenderCategoryOption): boolean {
    return this.navigationPermissionService.hasSavePermissionByNavId(option.permissionNavId);
  }

  open(path: string): void {
    this.router.navigate([path]);
  }
}
