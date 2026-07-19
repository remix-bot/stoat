import { createClient } from "redis";

export class RedisHandler {
  platform = "stoat";
  /**
   *
   * @param {Object} opts
   * @param {RedisClientOptions} opts.redis
   */
  constructor(opts) {
    const reconnectStrategy = (retries) => {
      if (retries > 10) return new Error("Redis retry limit exceeded");
      return Math.min(retries * 200, 5000);
    };

    this.client = createClient({
      ...opts.redis,
      socket: { reconnectStrategy }
    });
    this.client.on("error", (err) => {
      console.log("[Redis/Main] Error: ", err);
    });
    this.client.connect().then(() => {
      console.log("[RedisMain] Connected");
      this.readyMessage();
    });

    this.subscriber = this.client.duplicate({
      socket: { reconnectStrategy }
    });
    this.subscriber.on("error", (err) => {
      console.log("[Redis/Subscriber] Error: ", err);
    })
    this.subscriber.connect().then(() => {
      console.log("[Redis/Subscriber] Connected");
      this.subscriber.subscribe("request", async (m) => {
        const payload = JSON.parse(m);
        if (payload.platform !== this.platform) return;
        const result = await this.handleRequest(payload.content);
        this.send("response", JSON.stringify({
          id: payload.id,
          content: result
        }));
      });
      this.subscriber.subscribe("info", (m) => {
        const data = JSON.parse(m);
        if (data.platform !== "backend") return;
        if (data.type !== "requestConnected") return;
        this.readyMessage();
      });
      setInterval(() => {
        this.send(this.platform + ":ping", "" + Date.now());
      }, 10000);
    });
  }
  readyMessage() {
    this.send("info", JSON.stringify({
      platform: "stoat",
      type: "connected"
    }));
  }
  /**
   *
   * @param {string} channel
   * @param {String} message
   * @returns {Promise<number>}
   */
  send(channel, message) {
    return this.client.publish(channel, message);
  }

  /**
   * @callback RequestCallback
   * @param {Object} data
   * @param {string} data.type
   * @returns {Promise<Object>}
   */
  handleRequest;
  /**
   * @param {RequestCallback} handler
   */
  setRequestHandler(handler) {
    this.handleRequest = handler;
  }
}
