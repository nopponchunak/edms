import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AttachmentInfo {
  id: string;
  originalName: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/uploads`;

  upload(file: File) {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<AttachmentInfo>(this.base, fd);
  }

  /** The stored file itself (for putting it into a printed PDF). */
  fetchBlob(att: AttachmentInfo): Observable<Blob> {
    return this.http.get(`${this.base}/${att.filename}`, { responseType: 'blob' });
  }

  isPreviewable(att: AttachmentInfo): boolean {
    return att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf';
  }

  // Files sit behind the API login, so a plain link would be rejected: fetch with the token and return a temporary blob URL (the caller revokes it).
  blobUrl(att: AttachmentInfo): Observable<string> {
    return this.http.get(`${this.base}/${att.filename}`, { responseType: 'blob' }).pipe(
      map((blob) => URL.createObjectURL(new Blob([blob], { type: att.mimeType }))),
    );
  }

  download(att: AttachmentInfo): Observable<void> {
    return this.blobUrl(att).pipe(map((url) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = att.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }));
  }

  delete(filename: string) {
    return this.http.delete<{ message: string }>(`${this.base}/${filename}`);
  }
}
