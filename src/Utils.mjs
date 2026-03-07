export class Utils {
  static sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }
  static isNumber(n) {
    return !isNaN(n) && !isNaN(parseFloat(n));
  }
  static prettifyMS(milliseconds, type = "default") {
    const mode = ["default", "uptime", "player"].includes(type) ? type : "default";
    const parsedMilliseconds = Number(milliseconds);
    const safeMilliseconds = Number.isFinite(parsedMilliseconds) ? Math.max(0, Math.floor(parsedMilliseconds)) : 0;

    if (mode === "player") {
      const totalSeconds = Math.floor(safeMilliseconds / 1000);
      const seconds = totalSeconds % 60;
      const totalMinutes = Math.floor(totalSeconds / 60);
      const minutes = totalMinutes % 60;
      const hours = Math.floor(totalMinutes / 60);

      if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    const totalSeconds = Math.floor(safeMilliseconds / 1000);
    const parsed = {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor(totalSeconds / 3600) % 24,
      minutes: Math.floor(totalSeconds / 60) % 60,
      seconds: totalSeconds % 60
    };

    const units = {
      days: "d",
      hours: "h",
      minutes: "m",
      seconds: "s"
    };

    var result = "";
    for (let k in parsed) {
      if (!parsed[k]) continue;
      result += " " + parsed[k] + units[k];
    }
    return result.trim() || "0s";
  }
  /**
   * Generate a random id. I do not guarantee uniqueness in all cases, it should be fine however (Date + random).
   * @returns {string}
   */
  static uid() {
    return (new Date().valueOf().toString(36) + Math.random().toString(36).substr(2)).toUpperCase();
  }
}
