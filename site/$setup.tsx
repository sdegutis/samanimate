import { Reel } from "./$reel.js";

const canvas = <canvas id="canvas" width="1200" height="700"></canvas> as HTMLCanvasElement;

const thumbnails = <div id="thumbnails">
  <button class="thumbnail" style="font-size: 300%;" onclick={() => reel.addPicture()}>+</button>
</div> as HTMLDivElement;

const reel = new Reel(canvas, thumbnails);

const saved = localStorage.getItem('saved1');
if (saved) {
  const data = JSON.parse(saved);
  reel.load(data);
}
else {
  reel.addPicture();
}

const autosaveNow = () => {
  console.log('Autosaving: Start');
  console.log('Autosaving: Serializing...');
  const data = reel.serialize();
  console.log('Autosaving: Storing...');
  localStorage.setItem('saved1', data);
  console.log('Autosaving: Done!');
};

window.onbeforeunload = e => {
  autosaveNow();
};

let saveTimer: number | undefined;
reel.autosave = () => {
  if (saveTimer === undefined) {
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      autosaveNow();
    }, 1000 * 10);
  }
};

const shadowLeftButton = (<button class="button shadow active" onclick={() => {
  shadowRightButton.classList.remove('active');
  shadowLeftButton.classList.add('active');
  reel.useShadowLeft();
}}>&larr;</button> as HTMLButtonElement);

const shadowRightButton = (<button class="button shadow" onclick={() => {
  shadowRightButton.classList.add('active');
  shadowLeftButton.classList.remove('active');
  reel.useShadowRight();
}}>&rarr;</button> as HTMLButtonElement);

document.body.append(
  <div id="root">
    {canvas}
    {thumbnails}
    <div id="toolbar">
      <fieldset>
        <legend>Drawing</legend>
        <button class="button" onclick={() => reel.undo()}>Undo</button>
        <button class="button" onclick={() => reel.redo()}>Redo</button>
        <label>
          <span>Thickness</span>
          <input type="range" min="1" max="20" value="10" id="thickness" />
        </label>
      </fieldset>
      <fieldset>
        <legend>Shadows</legend>
        {shadowLeftButton}
        <label>
          <span>Shadows</span>
          <input type="range" min="0" max="5" value="3" id="shadows" />
        </label>
        {shadowRightButton}
      </fieldset>
      <fieldset>
        <legend>Animating</legend>
        <button id="animate" class="button animator">Animate</button>
        <label>
          <span>Speed</span>
          <input type="range" min="50" max="500" step="50" value="200" id="speed" />
        </label>
        <label>
          <span>Loop</span>
          <input type="checkbox" id="loop" checked />
        </label>
      </fieldset>
      <fieldset>
        <legend>Files</legend>
        <button id="new" class="button">New</button>
        <button id="save" class="button">Save</button>
        <button id="load" class="button">Load</button>
      </fieldset>
      <fieldset>
        <legend>Recording</legend>
        <button id="record" class="button recorder">Record</button>
      </fieldset>
    </div>
  </div>
);


document.getElementById('new')!.onclick = e => {
  if (reel.hasChanges && !warn()) return;

  localStorage.removeItem('saved1');
  window.onbeforeunload = null;
  location.reload();
};

document.getElementById('save')!.onclick = e => {
  const data = reel.serialize();
  const blob = new Blob([data], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'animation.json';
  link.click();
  reel.saved();
};

document.getElementById('load')!.onclick = e => {
  if (reel.hasChanges && !warn()) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = false;
  input.accept = 'application/json';
  input.oninput = async () => {
    const file = input.files?.[0];
    const text = await file?.text();
    if (text) {
      localStorage.setItem('saved1', text);
      window.onbeforeunload = null;
      location.reload();
    }
  };
  input.click();
};

document.getElementById('animate')!.onclick = e => {
  (e.target as HTMLButtonElement).classList.toggle('active');
  reel.toggleAnimating();
};

reel.stoppedAnimating = () => {
  document.getElementById('animate')!.classList.toggle('active');
};

let rec: MediaRecorder | undefined;
document.getElementById('record')!.onclick = e => {
  (e.target as HTMLButtonElement).classList.toggle('active');

  if (rec) {
    rec.stop();
    rec = undefined;
  }
  else {
    rec = new MediaRecorder(reel.canvas.captureStream(25));
    const blobParts: Blob[] = [];
    rec.ondataavailable = e => {
      blobParts.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(blobParts, { type: 'video/mp4' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'drawing.mp4';
      link.click();
    };
    rec.start(1000 / 25);
  }
};

persistElement(document.getElementById('loop') as HTMLInputElement, {
  value: 'checked',
  set: (loops) => { reel.loops = loops },
});

persistElement(document.getElementById('thickness') as HTMLInputElement, {
  value: 'value',
  set: (thickness) => { reel.thickness = +thickness; },
});

const shadowInput = document.getElementById('shadows') as HTMLInputElement;
const shadowLabel = shadowInput.previousElementSibling!;
persistElement(shadowInput, {
  value: 'value',
  set: (shadows) => {
    const s = (shadows === '1' ? '' : 's');
    shadowLabel.textContent = `${shadows} Shadow${s}`;
    reel.shadows = +shadows;
  },
});

persistElement(document.getElementById('speed') as HTMLInputElement, {
  value: 'value',
  set: (speed) => { reel.speed = +speed; },
});

function persistElement<E extends HTMLInputElement, K extends keyof E>(input: E, opts: {
  value: K,
  set: (val: E[K]) => void,
}) {
  const savedValue = localStorage.getItem(input.id);
  if (savedValue !== null) {
    input[opts.value] = JSON.parse(savedValue);
  }
  opts.set(input[opts.value]);
  input.oninput = e => {
    localStorage.setItem(input.id, String(input[opts.value]));
    opts.set(input[opts.value]);
  };
}

document.getElementById('root')!.style.display = 'grid';

function warn() {
  return confirm(`Are you sure? You have unsaved changes!`);
}
