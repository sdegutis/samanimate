(() => {
  // src/line.ts
  var Line = class {
    constructor(lastPoint) {
      this.lastPoint = lastPoint;
      this.segments = [];
    }
    addPoint(newPoint, pressure) {
      const path = new Path2D();
      path.moveTo(this.lastPoint.x, this.lastPoint.y);
      path.lineTo(newPoint.x, newPoint.y);
      this.segments.push({
        pressure,
        from: this.lastPoint,
        to: newPoint,
        path
      });
      this.lastPoint = newPoint;
    }
    inStroke(ctx, { x, y }) {
      return this.segments.some((s) => ctx.isPointInStroke(s.path, x, y));
    }
    draw(ctx, scale) {
      ctx.lineCap = "round";
      for (const s of this.segments) {
        ctx.beginPath();
        ctx.lineWidth = s.pressure * scale;
        ctx.moveTo(Math.round(s.from.x * scale), Math.round(s.from.y * scale));
        ctx.lineTo(Math.round(s.to.x * scale), Math.round(s.to.y * scale));
        ctx.stroke();
      }
    }
    serialize() {
      return [
        this.segments.map((s) => [s.from.x, s.from.y, s.to.x, s.to.y, s.pressure]),
        [this.lastPoint.x, this.lastPoint.y]
      ];
    }
    static load(d) {
      const [segments, [x, y]] = d;
      const line = new Line({ x, y });
      line.segments = segments.map((seg) => {
        const [fromX, fromY, toX, toY, pressure] = seg;
        const path = new Path2D();
        path.moveTo(fromX, fromY);
        path.lineTo(toX, toY);
        return {
          path,
          from: { x: fromX, y: fromY },
          to: { x: toX, y: toY },
          pressure
        };
      });
      return line;
    }
  };

  // src/picture.ts
  var Picture = class {
    constructor(index, thumbnail) {
      this.index = index;
      this.thumbnail = thumbnail;
      this.historyPoint = 0;
      this.history = [];
      this.allLines = [];
    }
    addLine(line) {
      this.pruneHistory();
      this.allLines.push(line);
      this.history.push({
        type: "AddLine",
        index: this.allLines.indexOf(line)
      });
    }
    removeLine(line) {
      this.pruneHistory();
      this.history.push({
        type: "RemoveLine",
        index: this.allLines.indexOf(line)
      });
    }
    pruneHistory() {
      const reachableLineIndexes = this.history.slice(0, this.historyPoint).map((a) => a.index);
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
      const indexes = /* @__PURE__ */ new Set();
      for (const action of this.history.slice(0, this.historyPoint)) {
        if (action.type === "AddLine") {
          indexes.add(action.index);
        } else {
          indexes.delete(action.index);
        }
      }
      return this.allLines.filter((line, i) => indexes.has(i));
    }
    redraw(ctx, scale = 1) {
      for (const line of this.visibleLines) {
        line.draw(ctx, scale);
      }
    }
    redrawThumbnail() {
      const thumbnailCtx = this.thumbnail.getContext("2d");
      thumbnailCtx.clearRect(0, 0, this.thumbnail.width, this.thumbnail.height);
      thumbnailCtx.strokeStyle = "#000";
      this.redraw(thumbnailCtx, 0.1);
    }
    serialize() {
      return {
        historyPoint: this.historyPoint,
        history: this.history.map((a) => [a.type === "AddLine" ? 1 : 0, a.index]),
        allLines: this.allLines.map((line) => line.serialize())
      };
    }
    load(data) {
      this.allLines = data.allLines.map((d) => Line.load(d));
      this.history = data.history.map(([type, index]) => ({
        type: type === 1 ? "AddLine" : "RemoveLine",
        index
      }));
      this.historyPoint = data.historyPoint;
    }
  };

  // src/reel.ts
  var Reel = class {
    constructor(canvas, thumbnailsContainer) {
      this.canvas = canvas;
      this.thumbnailsContainer = thumbnailsContainer;
      this.hasChanges = false;
      this.pictures = [];
      this.animating = false;
      this.shadowDir = -1;
      this._shadows = 3;
      this.thickness = 10;
      this.loops = true;
      this.speed = 10;
      this.ctx = this.canvas.getContext("2d");
      window.addEventListener("load", () => this.recalculateOffsets());
      window.addEventListener("resize", () => this.recalculateOffsets());
      this.canvas.onpointerdown = (e) => {
        if (this.animating)
          return;
        this.canvas.setPointerCapture(e.pointerId);
        if (e.buttons === 32) {
          this.startErasing(e);
        } else {
          this.startDrawing(e);
        }
      };
    }
    recalculateOffsets() {
      this.offsetX = this.canvas.getBoundingClientRect().left;
      this.offsetY = this.canvas.getBoundingClientRect().top;
    }
    startDrawing(e) {
      const line = new Line(this.getPointInCanvas(e));
      this.picture.addLine(line);
      this.canvas.onpointermove = (e2) => {
        line.addPoint(this.getPointInCanvas(e2), e2.pressure * this.thickness);
        this.hasChanges = true;
        this.redraw();
        this.redrawThumbnail();
      };
      this.handlePointerUp();
    }
    startErasing(e) {
      this.canvas.onpointermove = (e2) => {
        const p = this.getPointInCanvas(e2);
        const toDelete = this.picture.visibleLines.find((l) => l.inStroke(this.ctx, p));
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
    toggleAnimating() {
      this.animating = !this.animating;
      if (this.animating) {
        this.animateTick(true);
      } else {
        if (this.timer !== void 0) {
          clearTimeout(this.timer);
          this.timer = void 0;
        }
        this.selectPicture(this.picture.index);
      }
    }
    animateTick(ignoreLoops) {
      this.timer = void 0;
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
    addPicture(data) {
      if (this.animating)
        return;
      const index = this.pictures.length;
      const thumbnail = document.createElement("canvas");
      thumbnail.width = 120;
      thumbnail.height = 70;
      thumbnail.classList.add("thumbnail");
      thumbnail.onclick = (e) => {
        e.preventDefault();
        this.selectPicture(index);
      };
      const newPicture = new Picture(index, thumbnail);
      this.picture = newPicture;
      if (this.pictures.length > 0) {
        const firstPicture = this.pictures[this.pictures.length - 1];
        firstPicture.thumbnail.insertAdjacentElement("afterend", thumbnail);
      } else {
        this.thumbnailsContainer.insertAdjacentElement("afterbegin", thumbnail);
      }
      this.pictures.push(this.picture);
      if (data) {
        newPicture.load(data);
        newPicture.redrawThumbnail();
      } else {
        this.selectPicture(index);
        this.thumbnailsContainer.scrollTo({
          left: this.thumbnailsContainer.clientWidth,
          behavior: "smooth"
        });
      }
    }
    selectPicture(pictureIndex) {
      for (const picture of this.pictures) {
        picture.thumbnail.classList.remove("current");
      }
      this.picture = this.pictures[pictureIndex];
      this.picture.thumbnail.classList.add("current");
      this.picture.thumbnail.scrollIntoView({ behavior: this.animating ? "auto" : "smooth" });
      this.redraw();
      console.log("focusing picture", pictureIndex);
    }
    undo() {
      if (this.animating)
        return;
      this.picture.undo();
      this.redrawThumbnail();
      this.redraw();
      this.hasChanges = true;
      this.autosave();
    }
    redo() {
      if (this.animating)
        return;
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
      this.ctx.fillStyle = "#fff";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.animating) {
        let start = this.picture.index + this._shadows * this.shadowDir;
        if (start < 0)
          start = 0;
        if (start >= this.pictures.length)
          start = this.pictures.length - 1;
        const numShadows = Math.abs(this.picture.index - start);
        const GAP = 35;
        const BASE = 255 - GAP * (numShadows + 1);
        for (let i = start; i !== this.picture.index; i -= this.shadowDir) {
          const picture = this.pictures[i];
          const distance = (this.picture.index - i) * -this.shadowDir;
          const grey = BASE + distance * GAP;
          const style = "#" + grey.toString(16).padStart(2, "0").repeat(3);
          this.ctx.strokeStyle = style;
          picture.redraw(this.ctx);
        }
      }
      this.ctx.strokeStyle = "#000";
      this.picture.redraw(this.ctx);
    }
    set shadows(n) {
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
        pictures: this.pictures.map((pic) => pic.serialize())
      });
    }
    load(data) {
      console.log("Loading...");
      data.pictures.forEach((d) => this.addPicture(d));
      this.selectPicture(0);
      console.log("Done");
      this.hasChanges = true;
    }
    saved() {
      this.hasChanges = false;
    }
    getPointInCanvas(e) {
      return {
        x: e.clientX - this.offsetX,
        y: e.clientY - this.offsetY
      };
    }
  };

  // src/index.ts
  var reel = new Reel(document.getElementById("canvas"), document.getElementById("thumbnails"));
  var saved = localStorage.getItem("saved1");
  if (saved) {
    const data = JSON.parse(saved);
    reel.load(data);
  } else {
    reel.addPicture();
  }
  var autosaveNow = () => {
    console.log("Autosaving: Start");
    console.log("Autosaving: Serializing...");
    const data = reel.serialize();
    console.log("Autosaving: Storing...");
    localStorage.setItem("saved1", data);
    console.log("Autosaving: Done!");
  };
  window.onbeforeunload = (e) => {
    autosaveNow();
  };
  var saveTimer;
  reel.autosave = () => {
    if (saveTimer === void 0) {
      saveTimer = setTimeout(() => {
        saveTimer = void 0;
        autosaveNow();
      }, 1e3 * 10);
    }
  };
  var shadowLeftButton = document.getElementById("shadow-left");
  var shadowRightButton = document.getElementById("shadow-right");
  shadowLeftButton.onclick = (e) => {
    shadowRightButton.classList.remove("active");
    shadowLeftButton.classList.add("active");
    reel.useShadowLeft();
  };
  shadowRightButton.onclick = (e) => {
    shadowRightButton.classList.add("active");
    shadowLeftButton.classList.remove("active");
    reel.useShadowRight();
  };
  document.getElementById("undo-button").onclick = (e) => {
    reel.undo();
  };
  document.getElementById("redo-button").onclick = (e) => {
    reel.redo();
  };
  document.getElementById("add-picture").onclick = (e) => {
    reel.addPicture();
  };
  document.getElementById("new").onclick = (e) => {
    if (reel.hasChanges && !warn())
      return;
    localStorage.removeItem("saved1");
    window.onbeforeunload = null;
    location.reload();
  };
  document.getElementById("save").onclick = (e) => {
    const data = reel.serialize();
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "animation.json";
    link.click();
    reel.saved();
  };
  document.getElementById("load").onclick = (e) => {
    if (reel.hasChanges && !warn())
      return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = "application/json";
    input.oninput = async () => {
      const file = input.files?.[0];
      const text = await file?.text();
      if (text) {
        localStorage.setItem("saved1", text);
        window.onbeforeunload = null;
        location.reload();
      }
    };
    input.click();
  };
  document.getElementById("animate").onclick = (e) => {
    e.target.classList.toggle("active");
    reel.toggleAnimating();
  };
  reel.stoppedAnimating = () => {
    document.getElementById("animate").classList.toggle("active");
  };
  var rec;
  document.getElementById("record").onclick = (e) => {
    e.target.classList.toggle("active");
    if (rec) {
      rec.stop();
      rec = void 0;
    } else {
      rec = new MediaRecorder(reel.canvas.captureStream(25));
      const blobParts = [];
      rec.ondataavailable = (e2) => {
        blobParts.push(e2.data);
      };
      rec.onstop = () => {
        const blob = new Blob(blobParts, { type: "video/mp4" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "drawing.mp4";
        link.click();
      };
      rec.start(1e3 / 25);
    }
  };
  persistElement(document.getElementById("loop"), {
    value: "checked",
    set: (loops) => {
      reel.loops = loops;
    }
  });
  persistElement(document.getElementById("thickness"), {
    value: "value",
    set: (thickness) => {
      reel.thickness = +thickness;
    }
  });
  var shadowInput = document.getElementById("shadows");
  var shadowLabel = shadowInput.previousElementSibling;
  persistElement(shadowInput, {
    value: "value",
    set: (shadows) => {
      const s = shadows === "1" ? "" : "s";
      shadowLabel.textContent = `${shadows} Shadow${s}`;
      reel.shadows = +shadows;
    }
  });
  persistElement(document.getElementById("speed"), {
    value: "value",
    set: (speed) => {
      reel.speed = +speed;
    }
  });
  function persistElement(input, opts) {
    const savedValue = localStorage.getItem(input.id);
    if (savedValue !== null) {
      input[opts.value] = JSON.parse(savedValue);
    }
    opts.set(input[opts.value]);
    input.oninput = (e) => {
      localStorage.setItem(input.id, String(input[opts.value]));
      opts.set(input[opts.value]);
    };
  }
  document.getElementById("root").style.display = "grid";
  function warn() {
    return confirm(`Are you sure? You have unsaved changes!`);
  }
})();
