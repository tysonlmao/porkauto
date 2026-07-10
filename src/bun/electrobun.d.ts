/** Ambient types for the Electrobun main process (avoids pulling electrobun's TS sources). */
declare module "electrobun/bun" {
  export class BrowserWindow {
    constructor(options: {
      title?: string;
      url: string;
      frame?: {
        width?: number;
        height?: number;
        x?: number;
        y?: number;
      };
    });
  }
}
