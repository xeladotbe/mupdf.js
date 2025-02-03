import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { filter, first, skipWhile, switchMap, tap } from 'rxjs';
import { MupdfService } from './mupdf.service';
import { ReactiveFormsModule } from '@angular/forms';
import { AppPage } from './page.component';
import { debouncedSignal, previous } from './signals';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ReactiveFormsModule, AppPage],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly httpClient = inject(HttpClient);
  private readonly mupdfService = inject(MupdfService);

  private readonly workerReady = signal(false);
  pages = signal<Array<{ i: number }> | undefined>([]);

  zoomed = signal<{ zoom: number; src: string } | undefined>(undefined);
  previousZoomed = previous(this.zoomed);

  zoom = signal(1);
  debouncedZoom = debouncedSignal(this.zoom, 300);
  previousZoom = previous(this.debouncedZoom);

  zoomIn() {
    this.zoom.update((zoom) => Math.min(zoom + 0.125, 10));
  }

  zoomOut() {
    this.zoom.update((zoom) => Math.max(zoom - 0.125, 0.125));
  }

  ngOnDestroy(): void {}

  terminate() {
    this.mupdfService.terminate();
  }

  release() {
    this.mupdfService.release();
  }

  ngOnInit(): void {
    this.mupdfService.workerInitialized$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        skipWhile((workerInitialized) => !workerInitialized),
        first()
      )
      .subscribe(() => {
        this.workerReady.set(true);

        this.httpClient
          .get('/test2.pdf', { responseType: 'arraybuffer' })
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            switchMap((arrayBuffer) =>
              this.mupdfService.loadDocument(arrayBuffer)
            ),
            switchMap(() => this.mupdfService.countPages()),
            tap((pages) =>
              this.pages.set(
                Array(1)
                  .fill(undefined)
                  .map((_, i) => ({ i }))
              )
            )
          )
          .subscribe(() => {});
      });
  }
}
