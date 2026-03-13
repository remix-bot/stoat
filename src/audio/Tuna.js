const https = require("follow-redirects").https;

class Tuna {
  apiKey = null;
  constructor(auth) {
    this.apiKey = auth.key;
  }
  get(path, params={}) {
    return new Promise((resolve, rej) => {
      var query = "";
      for (let key in params) {
        if (query.length == 0) query = "?";
        query += ((query.length == 0) ? "?" : "&") + key + "=" + encodeURIComponent(params[key]);
      }
      var options = {
        'method': 'GET',
        'hostname': 'tuna-api.voicemod.net',
        'path': path + query,
        'headers': {
          'x-api-key': this.apiKey
        },
        'maxRedirects': 20
      };
      var req = https.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
          chunks.push(chunk);
        });

        res.on("end", function (_chunk) {
          var body = Buffer.concat(chunks);
          resolve(JSON.parse(body.toString()));
        });

        res.on("error", function (error) {
          rej(error);
        });
      });

      req.end();
    });
  }

  search(query, page=1, size=10) {
    return new Promise(async res => {
      const results = await this.get("/v1/sounds/search", {size, page, search: query});
      results.items = results.items.map(s => {
        s.download = function() {
          return new Promise(resolve => {
            https.get(this.oggPath, (r) => {
              resolve(r);
            });
          });
        }
        return s;
      })
      res(results);
    });
  }
  getSound(id) {
    return new Promise(async res => {
      const sound = await this.get("/v1/sounds/" + id);
      sound.download = function() {
        return new Promise(res => {
          https.get(this.oggPath, (result) => {
            res(result);
          });
        });
      }
      res(sound);
    });
  }
}

/*const tuna = new Tuna({ key: "apikey" });
(async () => {
  const results = await tuna.search("goofy ahh laugh");
  console.log(results.items[0].download());
})();*/

module.exports = Tuna;
