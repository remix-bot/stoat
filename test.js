const fs = require("fs");

const ws = fs.createWriteStream("test.txt", { flags: 'w' });

for (let i = 1; i <= 500000; i++) {
  ws.write("line " + i + "\n");
}

ws.on("close", () => {
  console.log("done");
});
