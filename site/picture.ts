import { Line, SerializedLine } from "./line.js";

type Action = {
  type: 'AddLine' | 'RemoveLine';
  index: number;
};

export class Picture {

  private historyPoint = 0;
  private history: Action[] = [];
  private allLines: Line[] = [];

  constructor(
    public index: number,
    public thumbnail: HTMLCanvasElement,
  ) { }

  addLine(line: Line) {
    this.pruneHistory();

    this.allLines.push(line);
    this.history.push({
      type: 'AddLine',
      index: this.allLines.indexOf(line),
    });
  }

  removeLine(line: Line) {
    this.pruneHistory();

    this.history.push({
      type: 'RemoveLine',
      index: this.allLines.indexOf(line),
    });
  }

  pruneHistory() {
    const reachableLineIndexes = (this.history
      .slice(0, this.historyPoint)
      .map(a => a.index));
    const highestLineIndex = Math.max(-1, ...reachableLineIndexes);
    this.allLines.length = highestLineIndex + 1;

    this.history.length = this.historyPoint++;
  }

  undo() {
    this.historyPoint = Math.max(this.historyPoint - 1, 0);
  }

  redo() {
    this.historyPoint = Math.min(this.historyPoint + 1, this.history.length);
  }

  get visibleLines() {
    const indexes = new Set<number>();
    for (const action of this.history.slice(0, this.historyPoint)) {
      if (action.type === 'AddLine') {
        indexes.add(action.index);
      }
      else {
        indexes.delete(action.index);
      }
    }
    return this.allLines.filter((line, i) => indexes.has(i));
  }

  redraw(ctx: CanvasRenderingContext2D, scale = 1) {
    for (const line of this.visibleLines) {
      line.draw(ctx, scale);
    }
  }

  redrawThumbnail() {
    const thumbnailCtx = this.thumbnail.getContext('2d')!;
    thumbnailCtx.clearRect(0, 0, this.thumbnail.width, this.thumbnail.height);
    thumbnailCtx.strokeStyle = '#000';
    this.redraw(thumbnailCtx, 0.1);
  }

  serialize(): SerializedPicture {
    return {
      historyPoint: this.historyPoint,
      history: this.history.map(a => [a.type === 'AddLine' ? 1 : 0, a.index]),
      allLines: this.allLines.map(line =>
        line.serialize())
    };
  }

  load(data: SerializedPicture) {
    this.allLines = data.allLines.map(d => Line.load(d));
    this.history = data.history.map(([type, index]) => ({
      type: (type === 1 ? 'AddLine' : 'RemoveLine') as Action['type'],
      index,
    }));
    this.historyPoint = data.historyPoint;
  }

}

export type SerializedPicture = {
  historyPoint: number,
  history: [number, number][],
  allLines: SerializedLine[],
};
