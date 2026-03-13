const ffmpeg = require("ffmpeg-static");
const { Transform } = require("node:stream");

class StreamMerger extends Transform { // main stream should be piped into it
  ffmpegPath = ffmpeg;
  ffmpeg = null;
  streamTree = [];

  constructor(streamOptions) {
    super(streamOptions);
  }
  _transform(chunk, _enc, cb) {
    if (!this.ffmpeg) { this.push(chunk); return cb(); }
    this.ffmpeg.stdio[3].write(chunk);
    cb();
  }
  pipe(stream) {
    // TODO: implement removal on main ffmpeg exit
    return super.pipe(stream);
  }

  setupBaseFfmpeg() {
    this.ffmpeg = this.spawnFfmpeg();
    this.ffmpeg.stderr.on("data", (chunk) => {
      console.log(chunk.toString());
    })
    this.ffmpeg.stdout.on("data", (chunk) => {
      console.log("data");
      this.push(chunk);
    });
  }
  spawnFfmpeg() {
    const args = "-i pipe:3 -re -i pipe:4 -vn -fflags nobuffer -filter_complex amix=inputs=2:duration=longest pipe:1".split(" ");
    return require("node:child_process").spawn(this.ffmpegPath, args, {
      windowsHide: true,
      stdio: [
        "pipe", "pipe", "pipe",
        "pipe", "pipe"
      ]
    });
  }

  findOpenNode() {
    if (this.streamTree.length == 0) return this.streamTree.push({
      process: this.ffmpeg,
      pipes: [4],
      available: true,
      children: []
    }), this.streamTree[0]; // new tree initiated
    const findChild = (node) => {
      if (node.available) return node;
      for (const child of node.children) {
        const c = findChild(child); // recursively search for available nodes
        if (c) return c;
      }
      return null; // this shouldn't happen
    }
    for (const node of this.streamTree) {
      const firstChild = findChild(node);
      if (firstChild) return firstChild;
    }
    return null; // this shouldn't happen
  }

  addStream(s) {
    if (!this.ffmpeg) this.setupBaseFfmpeg();
    const open = this.findOpenNode();
    if (!open) throw "Impossible case detected. No free merge node found.";

    const p = this.spawnFfmpeg();
    const node = {
      process: p,
      pipes: [4],
      available: true,
      parent: open,
      children: []
    };
    open.children.push(node);
    s.pipe(p.stdio[3]);
    p.stderr.on("data", (c) => {
      console.log(c.toString());
    })
    p.stdio[4].write(Buffer.alloc(1024, 0));
    p.stdout.pipe(open.process.stdio[open.pipes[0]]);
    const pipeNumber = open.pipes[0].valueOf(); // copy number; prevent referencing
    open.pipes.splice(0, 1); // remove available pipe;
    if (open.pipes.length == 0) open.available = false;

    s.on("data", () => {
      console.log("in2");
    });

    p.on("exit", () => { // this only happens when all input streams close
      open.pipes.push(pipeNumber);
      open.available = true;
      // node unused; remove;
      const idx = open.children.findIndex(c => c == node)
      if (idx === -1) throw "Impossible case detected. Damaged node structure.";
      open.children.splice(idx, 1);
    });
  }
}

module.exports = StreamMerger;
