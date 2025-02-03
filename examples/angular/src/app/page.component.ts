import { HttpClient } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed, toObservable } from "@angular/core/rxjs-interop";
import {
  combineLatest,
  filter,
  first,
  forkJoin,
  Observable,
  skipWhile,
  switchMap,
  takeUntil,
  tap,
} from "rxjs";
import { MupdfService } from "./mupdf.service";
import { CommonModule } from "@angular/common";
import { debouncedSignal, previous } from "./signals";

type Assert = (condition: unknown, message?: string) => asserts condition;
const assertNonNullish: Assert = <T>(
  value: T | undefined
): asserts value is NonNullable<T> => {
  if (!value) {
    throw new Error("is null");
  }
};

@Component({
  selector: "app-page",
  imports: [CommonModule],
  standalone: true,
  template: `
    @if(dimensions(); as dimensions) {

    <div
      style="position: relative;"
      [style.width]="dimensions.width * zoom() + 'px'"
      [style.height]="dimensions.height * zoom() + 'px'"
    >
      @if (test(); as result) { @for(e of result.tiles; track e.url) {
      <div
        style="position: absolute;"
        [style.top]="e.top + 'px'"
        [style.left]="e.left + 'px'"
      >
        <img [src]="e.url" />
      </div>
      } }
    </div>

    <div
      style="width: {{ dimensions.width * zoom() }}px; height: {{
        dimensions.height * zoom()
      }}px; position: relative;"
    >
      <div
        style="transform: matrix(1, 0, 0, 1, 0, 0); transform-origin: 0px 0px; position: absolute; width: 100%; height: 100%;"
      >
        @if (original(); as url) {
        <div
          style="transform-origin: 0 0; width: {{
            dimensions.width
          }}px; height: {{ dimensions.height }}px; transform: scale( {{
            zoom()
          }} ); transition: linear 150ms;"
        >
          <img [src]="url" />
        </div>
        }

        <div
          style="position: absolute; top: 0; left: 0; bottom: 0; right: 0; transform-origin: 0 0; transform: scale({{
            scaleDown()
          }});  transition: linear 150ms;"
          [style.opacity]="!!!zoomed()?.src ? 0 : 1"
        >
          <img [src]="zoomed()?.src" #img />
        </div>
      </div>
    </div>
    }
  `,
  styleUrl: "./app.component.css",
})
export class AppPage implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mupdfService = inject(MupdfService);

  private readonly workerReady = signal(false);

  original = signal<string | undefined>(undefined);

  dimensions = signal<{ width: number; height: number } | undefined>(undefined);

  url = signal<string | undefined>(undefined);

  zoomed = signal<{ zoom: number; src: string } | undefined>(undefined);
  previousZoomed = previous(this.zoomed);

  test = signal<
    | {
        scale: number;
        tiles: Array<{
          url: string;
          pageBox: [number, number, number, number];
          top: number;
          width: number;
          height: number;
          left: number;
        }>;
      }
    | undefined
  >(undefined);

  index = input.required<number>();

  zoom = input<number>(1);

  abortZoomRender = toObservable(this.zoom);

  debouncedZoom = debouncedSignal(this.zoom, 300);
  previousZoom = previous(this.debouncedZoom);

  scaleDown = computed(() => {
    const zoom = this.zoom();
    const zoomed = this.zoomed();

    if (zoomed?.zoom) {
      return Math.min(zoom / zoomed.zoom, 1);
    }

    return 1;
  });

  constructor() {
    effect(() => {
      const previousZoomed = this.previousZoomed();

      if (!!previousZoomed) {
        URL.revokeObjectURL(previousZoomed.src);
      }
    });

    effect(
      () => {
        const zoom = this.zoom();
        const zoomed = untracked(this.zoomed);

        if (!!zoomed && zoom <= zoomed?.zoom) {
          return;
        }

        this.zoomed.set(undefined);
      },
      {
        allowSignalWrites: true,
      }
    );

    effect(
      () => {
        const zoom = this.debouncedZoom();
        const zoomed = untracked(this.zoomed);
        const workerReady = this.workerReady();

        if ((!!zoomed && zoom <= zoomed?.zoom) || zoom === 1) {
          return;
        }

        this.zoomed.set(undefined);

        if (workerReady) {
          this.mupdfService
            .renderPageAsImage(this.index(), zoom)
            .subscribe((result) => {
              console.log(result);
              result && this.test.set(result);
            });

          /*  this.mupdfService
            .renderPageAsImage(this.index(), zoom)
            .pipe(
              filter(
                (url): url is { url: string; scale: number } =>
                  typeof url === 'object'
              ),
              filter(({ scale }) => {
                console.log({
                  index: this.index(),
                  zoom,
                  zoomUntracked: untracked(this.zoom),
                  scale,
                });
                return scale >= untracked(this.zoom);
              })
            )
            .subscribe(({ url }) => {
              this.zoomed.set({ zoom, src: url });
            }); */
        }
      },
      {
        allowSignalWrites: true,
      }
    );
  }

  ngOnDestroy(): void {
    const url = this.url();

    if (!!url) {
      URL.revokeObjectURL(url);
    }
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

        this.mupdfService
          .dimensions(this.index())
          .subscribe((dimensions) => this.dimensions.set(dimensions));
        /*
        this.mupdfService
          .renderPageAsImage(this.index(), 3)
          .subscribe((result) => {
            console.log(result);
            result && this.test.set(result);
          }); */

        combineLatest([
          // [ulx,uly,lrx,lry]

          // ULX,ULY                    URX,URY
          //                            LRX,LRY

          // top left
          this.mupdfService.renderPartialPageAsImage(
            this.index(),
            1,
            [0, 0, 250, 250]
          ),

          // top right
          this.mupdfService.renderPartialPageAsImage(
            this.index(),
            1,
            [250, 0, 500, 250]
          ),

          // bottom left
          this.mupdfService.renderPartialPageAsImage(
            this.index(),
            1,
            [0, 250, 250, 500]
          ),

          // bottom right
          this.mupdfService.renderPartialPageAsImage(
            this.index(),
            1,
            [250, 250, 500, 500]
          ),
        ]).subscribe((tiles) => {
          console.log(tiles);
          this.test.set({ scale: 1, tiles });
        });

        /* combineLatest([
          this.mupdfService.renderPageAsImage(this.index(), 1),
          this.mupdfService.dimensions(this.index()),
        ])
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            filter(
              (
                arg
              ): arg is [
                { url: string; scale: number },
                { width: number; height: number }
              ] => arg != null
            )
          )
          .subscribe(([{ url }, dimensions]) => {
            this.dimensions.set(dimensions);
            this.original.set(url);
          }); */
      });
  }
}
