import { Injectable } from '@angular/core';
import * as Comlink from 'comlink';
import { BehaviorSubject, defer, throwError } from 'rxjs';
import { MUPDF_LOADED } from './mupdf';
import { MupdfWorker } from './mupdf.worker';

@Injectable({
  providedIn: 'root',
})
export class MupdfService {
  private orgWorker?: Worker;
  private worker!: Comlink.Remote<MupdfWorker>;

  private readonly workerInitializedSubject = new BehaviorSubject(false);

  readonly workerInitialized$ = this.workerInitializedSubject.asObservable();

  constructor() {
    this.initializeWorker();
  }

  terminate() {
    this.orgWorker?.terminate();
  }

  release() {
    this.worker?.release();
  }

  private async initializeWorker() {
    this.worker = await new Promise<Comlink.Remote<MupdfWorker>>(
      async (resolve) => {
        const worker = (this.orgWorker = new Worker(
          new URL('./mupdf.worker', import.meta.url),
          {
            type: 'module',
          }
        ));

        const RemoteMupdfWorker = Comlink.wrap<typeof MupdfWorker>(worker);
        const instance = await new RemoteMupdfWorker();

        const onWorkerMessage = (message: MessageEvent) => {
          if (message.data === MUPDF_LOADED) {
            resolve(instance);

            this.workerInitializedSubject.next(true);

            worker.removeEventListener('message', onWorkerMessage);
          }
        };

        worker.addEventListener('message', onWorkerMessage);
      }
    );
  }

  countPages() {
    return defer(() => this.worker.countPages());
  }

  dimensions(pageIndex: number) {
    return defer(() => this.worker.dimensions(pageIndex));
  }

  loadDocument(document: ArrayBuffer) {
    return defer(() => this.worker.loadDocument(document));
  }

  renderPageAsImage(pageIndex: number, scale = 1, type: 'PNG' | 'JPG' = 'PNG') {
    return defer(() => {
      console.time('renderPageAsImage ' + scale);
      return this.worker
        .renderPageAsImage(pageIndex, window.devicePixelRatio * scale)
        .finally(() => {
          console.timeEnd('renderPageAsImage ' + scale);
        });
    });
  }

  renderPartialPageAsImage(
    ...args: Parameters<typeof this.worker.renderPartialPageAsImage>
  ) {
    return defer(() => this.worker.renderPartialPageAsImage(...args));
  }
}
