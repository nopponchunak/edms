import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map } from 'rxjs';

/** Open an API PDF through HttpClient so the auth interceptor can attach the JWT. */
@Injectable({ providedIn: 'root' })
export class AuthenticatedPdfService {
  constructor(
    private readonly http: HttpClient,
    private readonly snackBar: MatSnackBar
  ) {}

  loadObjectUrl(url: string): Observable<string> {
    return this.http.get(url, { responseType: 'blob' }).pipe(
      map((blob) => {
        if (blob.type?.toLowerCase().includes('json')) {
          throw new Error('The server did not return a PDF.');
        }
        return URL.createObjectURL(blob);
      })
    );
  }

  open(url: string): boolean {
    // Open synchronously in the click handler so pop-up blockers do not block it.
    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) {
      this.snackBar.open('Unable to open PDF. Please allow pop-ups for this site.', 'Close', { duration: 5000 });
      return false;
    }

    pdfWindow.document.title = 'Loading PDF...';
    this.loadObjectUrl(url).subscribe({
      next: (objectUrl) => {
        pdfWindow.location.href = objectUrl;
        // Keep the URL alive for the browser's PDF viewer and Save action.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 15 * 60 * 1000);
      },
      error: () => {
        pdfWindow.close();
        this.snackBar.open('Unable to load PDF. Please try again.', 'Close', { duration: 5000 });
      },
    });
    return true;
  }
}
