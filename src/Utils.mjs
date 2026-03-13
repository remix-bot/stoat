export class Utils {
  static sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }
  static isNumber(n) {
    return !isNaN(n) && !isNaN(parseFloat(n));
  }
  static prettifyMS(milliseconds) {
    const roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil;

    const parsed = {
      days: roundTowardsZero(milliseconds / 86400000),
      hours: roundTowardsZero(milliseconds / 3600000) % 24,
      minutes: roundTowardsZero(milliseconds / 60000) % 60,
      seconds: roundTowardsZero(milliseconds / 1000) % 60,
      milliseconds: roundTowardsZero(milliseconds) % 1000,
      microseconds: roundTowardsZero(milliseconds * 1000) % 1000,
      nanoseconds: roundTowardsZero(milliseconds * 1e6) % 1000
    };

    const units = {
      days: "d",
      hours: "h",
      minutes: "m",
      seconds: "s"
    }

    var result = "";
    for (let k in parsed) {
      if (!parsed[k] || !units[k]) continue;
      result += " " + parsed[k] + units[k];
    }
    return result.trim();
  }
  /**
   * Shuffles an array, should be in-place. Array is returned anyways.
   * @param {any[]} a
   * @returns {any[]}
   */
  static shuffleArr(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  }
  /**
   * Generate a random id. I do not guarantee uniqueness in all cases, it should be fine however (Date + random).
   * @returns {string}
   */
  static uid() {
    return (new Date().valueOf().toString(36) + Math.random().toString(36).substr(2)).toUpperCase();
  }
}
