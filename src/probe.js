const ffprobe = require("ffprobe-static");

module.exports = function(file) {
  return new Promise(res => {
    const options = "-hide_banner -show_entries format_tags:format=duration -print_format json -i " + file + "";

    const process = require("child_process").spawn(ffprobe.path, options.split(" "));
    const chunks = [];
    //process.stderr.on("data", (d) => console.log(Buffer.from(d).toString()))
    process.stdout.on("data", (d) => {
      chunks.push(d);
    });
    process.stdout.on("end", () => {
      const data = JSON.parse(Buffer.concat(chunks).toString());
      res({
        album: data.format?.tags?.album,
        artist: data.format?.tags?.artist,
        title: data.format?.tags?.title || data.format?.tags?.StreamTitle,
        duration: data.format.duration * 1000 // convert to ms
      });
    });
  });
}
