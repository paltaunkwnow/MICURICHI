declare module 'mapshaper' {
  const mapshaper: {
    applyCommands(
      commands: string,
      inputs?: Record<string, Buffer | string>,
    ): Promise<Record<string, Buffer | string>>;
    runCommands(commands: string): Promise<void>;
  };
  export default mapshaper;
}
declare module 'rbush' {
  export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export default class RBush<T extends BBox> {
    constructor(maxEntries?: number);
    load(items: ReadonlyArray<T>): this;
    insert(item: T): this;
    search(bbox: BBox): T[];
    all(): T[];
    clear(): this;
  }
}
