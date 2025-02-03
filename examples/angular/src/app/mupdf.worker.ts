/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import * as mupdf from 'mupdf';
import { MUPDF_LOADED } from './mupdf';

/**
 * File is located in the public folder, add the following to your angular.json (assets section)
 *
 * {
 *  "glob": "*.{js,wasm}",
 *  "input": "node_modules/mupdf/dist"
 * }
 */
const mupdfScript = '/mupdf.js';

export class MupdfWorker {
  private mupdf?: typeof mupdf;
  private document!: mupdf.PDFDocument;

  constructor() {
    this.initializeMupdf();
  }

  private initializeMupdf() {
    /**
     * Angular does not support top level awaits, so we use a variable to dynamically import our mupdf.js script.
     * see: https://github.com/angular/angular-cli/issues/26507
     */
    import(/* @vite-ignore */ mupdfScript).then((mupdf) => {
      this.mupdf = mupdf;

      postMessage(MUPDF_LOADED);
    });
  }

  countPages() {
    return this.document?.countPages();
  }

  dimensions(at: number) {
    const page = this.document?.loadPage(at);
    const bounds = page!.getBounds();

    try {
      return { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1] };
    } finally {
      page?.destroy();
    }
  }

  release() {
    this.document?.destroy();
  }

  loadDocument(document: ArrayBuffer) {
    this.document = this.mupdf!.Document.openDocument(
      document,
      'application/pdf'
    ) as mupdf.PDFDocument;

    return true;
  }

  renderPartialPageAsImage(
    at: number = 0,
    scale: number = 1,
    pageBox: Parameters<typeof mupdf.PDFPage.prototype.setPageBox>[1]
  ) {
    const page = this.document?.loadPage(at) as mupdf.PDFPage;
    page?.setPageBox('CropBox', pageBox);

    const buffer = page?.toPixmap(
      [scale, 0, 0, scale, 0, 0],
      this.mupdf!.ColorSpace.DeviceRGB,
      true,
      false,
      'View',
      'CropBox'
    );

    let uint8Array;

    try {
      uint8Array = buffer?.asPNG();

      return (
        uint8Array && {
          url: URL.createObjectURL(
            new Blob([uint8Array], { type: 'image/png' })
          ),
          pageBox,
          /**
 *
         combineLatest([
           this.mupdfService.renderPartialPageAsImage(
             this.index(),
             1,
             [0, 250, 250, 0]
           ),
           this.mupdfService.renderPartialPageAsImage(
             this.index(),
             1,
             [250, 250, 500, 0]
           ),
           this.mupdfService.renderPartialPageAsImage(
             this.index(),
             1,
             [0, 500, 250, 250]
           ),
           this.mupdfService.renderPartialPageAsImage(
             this.index(),
             1,
             [250, 500, 500, 250]
           ),
         ]).subscribe((tiles) => {
 */
          top: pageBox[3] * scale,
          left: pageBox[0] * scale,
          width: pageBox[2] - pageBox[0] * scale,
          height: pageBox[1] - pageBox[3] * scale,
        }
      );
    } catch (error) {
      console.error(error);

      throw error;
    } finally {
      uint8Array = null;

      page?.destroy();
      buffer?.destroy();
    }
  }

  renderPageAsImage(
    at: number = 0,
    scale: number = 1,
    pageBox?: Parameters<typeof mupdf.PDFPage.prototype.setPageBox>[1]
  ) {
    const dimensions = this.dimensions(at);

    let tileWidth, tileHeight;

    if (scale >= 3) {
      tileWidth = dimensions.width / scale;
      tileHeight = dimensions.height / scale;
    } else if (scale >= 2) {
      tileWidth = dimensions.width;
      tileHeight = dimensions.height / 2;
    } else {
      tileWidth = dimensions.width / 2;
      tileHeight = dimensions.height / 2;
    }

    const tilesX = dimensions.width / tileWidth;
    const tilesY = dimensions.height / tileHeight;
    const tileData: Array<ReturnType<typeof this.renderPartialPageAsImage>> =
      [];

    for (let i = 0; i < tilesY; i++) {
      for (let j = 0; j < tilesX; j++) {
        tileData.push(
          this.renderPartialPageAsImage(at, scale, [
            j * tileWidth,
            tileHeight + i * tileHeight,
            tileWidth + j * tileWidth,
            i * tileHeight,
          ])
        );
      }
    }

    return { scale, tiles: tileData };
  }
}

Comlink.expose(MupdfWorker);
