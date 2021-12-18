import { Line } from "./line.js";
import { Picture, SerializedPicture } from "./picture.js";

export class Reel {

  hasChanges = false;

  picture!: Picture;
  pictures: Picture[] = [];

  animating = false;

  shadowDir = -1;
  private _shadows = 3;

  thickness = 10;
  loops = true;
  speed = 10;

  stoppedAnimating!: () => void;
  autosave!: () => void;

  offsetX!: number;
  offsetY!: number;

  ctx: CanvasRenderingContext2D;

  constructor(
    public canvas: HTMLCanvasElement,
    private thumbnailsContainer: HTMLDivElement,
  ) {
    this.ctx = this.canvas.getContext('2d')!;

    window.addEventListener('load', () => this.recalculateOffsets());
    window.addEventListener('resize', () => this.recalculateOffsets());

    this.canvas.onpointerdown = (e) => {
      if (this.animating) return;

      this.canvas.setPointerCapture(e.pointerId);
      if (e.buttons === 32) {
        this.startErasing(e);
      }
      else {
        this.startDrawing(e);
      }
    };
  }

  private recalculateOffsets() {
    this.offsetX = this.canvas.getBoundingClientRect().left;
    this.offsetY = this.canvas.getBoundingClientRect().top;
  }

  startDrawing(e: PointerEvent) {
    const line = new Line(this.getPointInCanvas(e));
    this.picture.addLine(line);

    this.canvas.onpointermove = (e) => {
      line.addPoint(this.getPointInCanvas(e), e.pressure * this.thickness);
      this.hasChanges = true;

      this.redraw();
      this.redrawThumbnail();
    };

    this.handlePointerUp();
  }

  startErasing(e: PointerEvent) {
    this.canvas.onpointermove = (e) => {
      const p = this.getPointInCanvas(e);

      const toDelete = this.picture.visibleLines.find(l => l.inStroke(this.ctx, p));
      if (toDelete) {
        this.picture.removeLine(toDelete);
        this.hasChanges = true;

        this.redrawThumbnail();
        this.redraw();
      }
    };

    this.handlePointerUp();
  }

  handlePointerUp() {
    this.canvas.onpointerup = (e) => {
      this.canvas.onpointermove = null;
      this.canvas.onpointerup = null;

      if (this.hasChanges) {
        this.autosave();
      }
    };
  }

  timer: number | undefined;
  toggleAnimating() {
    this.animating = !this.animating;

    if (this.animating) {
      this.animateTick(true);
    }
    else {
      if (this.timer !== undefined) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
      this.selectPicture(this.picture.index);
    }
  }

  animateTick(ignoreLoops: boolean) {
    this.timer = undefined;

    let next = this.picture.index + 1;
    if (next == this.pictures.length) {
      if (!this.loops && !ignoreLoops) {
        this.animating = false;
        this.stoppedAnimating();
        return;
      }
      next = 0;
    }
    this.selectPicture(next);

    if (this.animating) {
      this.timer = setTimeout(() => {
        this.animateTick(false);
      }, this.speed);
    }
  }

  addPicture(data?: SerializedPicture) {
    if (this.animating) return;

    const index = this.pictures.length;
    const thumbnail = document.createElement('canvas');
    thumbnail.width = 120;
    thumbnail.height = 70;

    thumbnail.classList.add('thumbnail');
    thumbnail.onclick = e => {
      e.preventDefault();
      this.selectPicture(index);
    };

    const newPicture = new Picture(index, thumbnail);
    this.picture = newPicture;

    if (this.pictures.length > 0) {
      const firstPicture = this.pictures[this.pictures.length - 1];
      firstPicture!.thumbnail.insertAdjacentElement('afterend', thumbnail);
    }
    else {
      this.thumbnailsContainer.insertAdjacentElement('afterbegin', thumbnail);
    }

    this.pictures.push(this.picture);

    if (data) {
      newPicture.load(data);
      newPicture.redrawThumbnail();
    }
    else {
      this.selectPicture(index);
      this.thumbnailsContainer.scrollTo({
        left: this.thumbnailsContainer.clientWidth,
        behavior: 'smooth',
      });
    }
  }

  selectPicture(pictureIndex: number) {
    for (const picture of this.pictures) {
      picture.thumbnail.classList.remove('current');
    }

    this.picture = this.pictures[pictureIndex]!;
    this.picture.thumbnail.classList.add('current');

    this.picture.thumbnail.scrollIntoView({ behavior: this.animating ? 'auto' : 'smooth' });

    this.redraw();

    console.log('focusing picture', pictureIndex)
  }

  undo() {
    if (this.animating) return;

    this.picture.undo();
    this.redrawThumbnail();
    this.redraw();

    this.hasChanges = true;
    this.autosave();
  }

  redo() {
    if (this.animating) return;

    this.picture.redo();
    this.redrawThumbnail();
    this.redraw();

    this.hasChanges = true;
    this.autosave();
  }

  redrawThumbnail() {
    this.picture.redrawThumbnail();
  }

  redraw() {
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.animating) {
      let start = this.picture.index + (this._shadows * this.shadowDir);
      if (start < 0) start = 0;
      if (start >= this.pictures.length) start = this.pictures.length - 1;

      const numShadows = Math.abs(this.picture.index - start);
      const GAP = 35;
      const BASE = 255 - (GAP * (numShadows + 1));

      for (let i = start; i !== this.picture.index; i -= this.shadowDir) {
        const picture = this.pictures[i];

        const distance = (this.picture.index - i) * -this.shadowDir;
        const grey = BASE + (distance * GAP);

        const style = '#' + grey.toString(16).padStart(2, '0').repeat(3);
        this.ctx.strokeStyle = style;

        picture!.redraw(this.ctx);
      }
    }

    this.ctx.strokeStyle = '#000';
    this.picture!.redraw(this.ctx);
  }

  set shadows(n: number) {
    this._shadows = n;
    this.redraw();
  }

  useShadowLeft() {
    this.shadowDir = -1;
    this.redraw();
  }

  useShadowRight() {
    this.shadowDir = 1;
    this.redraw();
  }

  serialize() {
    return JSON.stringify({
      pictures: this.pictures.map(pic => pic.serialize())
    });
  }

  load(data: SerializedReel) {
    console.log("Loading...");
    data.pictures.forEach((d) => this.addPicture(d));
    this.selectPicture(0);
    console.log("Done");
    this.hasChanges = true;
  }

  saved() {
    this.hasChanges = false;
  }

  getPointInCanvas(e: PointerEvent) {
    return {
      x: e.clientX - this.offsetX,
      y: e.clientY - this.offsetY,
    };
  }

}

type SerializedReel = {
  pictures: SerializedPicture[];
};
