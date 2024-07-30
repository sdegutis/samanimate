export type Point = { x: number, y: number };

export class Line {

  segments: {
    pressure: number,
    path: Path2D,
    from: Point,
    to: Point,
  }[] = [];

  constructor(
    private lastPoint: Point,
  ) { }

  addPoint(newPoint: Point, pressure: number) {
    const path = new Path2D();
    path.moveTo(this.lastPoint.x, this.lastPoint.y);
    path.lineTo(newPoint.x, newPoint.y);

    this.segments.push({
      pressure,
      from: this.lastPoint,
      to: newPoint,
      path,
    });

    this.lastPoint = newPoint;
  }

  inStroke(ctx: CanvasRenderingContext2D, { x, y }: Point) {
    return this.segments.some(s =>
      ctx.isPointInStroke(s.path, x, y));
  }

  draw(ctx: CanvasRenderingContext2D, scale: number) {
    ctx.lineCap = 'round';
    for (const s of this.segments) {
      ctx.beginPath();
      ctx.lineWidth = s.pressure * scale;
      ctx.moveTo(Math.round(s.from.x * scale), Math.round(s.from.y * scale));
      ctx.lineTo(Math.round(s.to.x * scale), Math.round(s.to.y * scale));
      ctx.stroke();
    }
  }

  serialize(): SerializedLine {
    return [
      this.segments.map(s => [s.from.x, s.from.y, s.to.x, s.to.y, s.pressure]),
      [this.lastPoint.x, this.lastPoint.y],
    ];
  }

  static load(d: SerializedLine) {
    const [segments, [x, y]] = d;
    const line = new Line({ x, y });
    line.segments = segments.map(seg => {
      const [fromX, fromY, toX, toY, pressure] = seg;
      const path = new Path2D();
      path.moveTo(fromX, fromY);
      path.lineTo(toX, toY);

      return {
        path,
        from: { x: fromX, y: fromY },
        to: { x: toX, y: toY },
        pressure,
      };
    });
    return line;
  }

}

export type SerializedLine = [
  [number, number, number, number, number][],
  [number, number]
];
