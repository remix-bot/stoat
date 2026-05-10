export default class ColourUtil {
  constructor() {

  }
  /*
  most of this code has been taken from the following article and github repository:
  https://dev.to/producthackers/creating-a-color-palette-with-javascript-44ip
  https://github.com/zygisS22/color-palette-extraction
  */
  pickColour(img) { // not sure how to call this algorithm tbh
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    canvas.remove();

    const rgbArray = this.buildRgb(imageData.data);
    const quantColors = this.quantization(rgbArray, 0);

    let i = ~~(quantColors.length / 2);
    return quantColors[i];
  }

  isLight(rgb) {
    const brightness = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return brightness > 155;
  }
  hexToRgbA(hex, a) {
    var c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
      c= hex.substring(1).split('');
      if(c.length== 3){
        c= [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c= '0x'+c.join('');
      return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',' + a + ')';
    }
    throw new Error('Bad Hex');
  }
  createGradientRGB(colors) {
    var gradient = "linear-gradient(30deg";
    colors.forEach((color, i) => {
      const a = (i/colors.length) * 3;
      gradient += `, rgb(${color.r}, ${color.g}, ${color.b}) ${i/colors.length * 100}%`;
    });
    return gradient += ")";
  }
  createGradient(colors) {
    var gradient = "linear-gradient(30deg";
    colors.forEach((color, i) => {
      const a = (i/colors.length) * 3;
      gradient += `, ${this.hexToRgbA(color, (a > 1) ? 1 : a)} ${i/colors.length * 100}%`;
    });
    return gradient += ")";
  }
  buildPalette(colorsList) {
    var orderedByColor = this.orderByLuminance(colorsList);
    const remove = Math.ceil(orderedByColor.length * 0.3);
    orderedByColor = orderedByColor.slice(0, orderedByColor.length - remove)

    const palette = [];

    for (let i = 0; i < orderedByColor.length; i++) {
      const hexColor = this.rgbToHex(orderedByColor[i]);

      /*if (i > 0) {
        const difference = calculateColorDifference(
          orderedByColor[i],
          orderedByColor[i - 1]
        );

        // if the distance is less than 120 we ommit that color
        if (difference < 120) {
          continue;
        }
      }*/
      palette.push(hexColor);
    }
    return palette;
  };
  //  Convert each pixel value ( number ) to hexadecimal ( string ) with base 16
  rgbToHex(pixel) {
    const componentToHex = (c) => {
      const hex = c.toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    };

    return (
      "#" +
      componentToHex(pixel.r) +
      componentToHex(pixel.g) +
      componentToHex(pixel.b)
    ).toUpperCase();
  };
  /**
   * Convert HSL to Hex
   * this entire formula can be found in stackoverflow, credits to @icl7126 !!!
   * https://stackoverflow.com/a/44134328/17150245
   */
  hslToHex(hslColor) {
    const hslColorCopy = { ...hslColor };
    hslColorCopy.l /= 100;
    const a =
      (hslColorCopy.s * Math.min(hslColorCopy.l, 1 - hslColorCopy.l)) / 100;
    const f = (n) => {
      const k = (n + hslColorCopy.h / 30) % 12;
      const color = hslColorCopy.l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
  };
  /**
   * Convert RGB values to HSL
   * This formula can be
   * found here https://www.niwa.nu/2013/05/math-behind-colorspace-conversions-rgb-hsl/
   */
  convertRGBtoHSL(rgbValues) {
    return rgbValues.map((pixel) => {
      let hue,
        saturation,
        luminance = 0;

      // first change range from 0-255 to 0 - 1
      let redOpposite = pixel.r / 255;
      let greenOpposite = pixel.g / 255;
      let blueOpposite = pixel.b / 255;

      const Cmax = Math.max(redOpposite, greenOpposite, blueOpposite);
      const Cmin = Math.min(redOpposite, greenOpposite, blueOpposite);

      const difference = Cmax - Cmin;

      luminance = (Cmax + Cmin) / 2.0;

      if (luminance <= 0.5) {
        saturation = difference / (Cmax + Cmin);
      } else if (luminance >= 0.5) {
        saturation = difference / (2.0 - Cmax - Cmin);
      }

      /**
       * If Red is max, then Hue = (G-B)/(max-min)
       * If Green is max, then Hue = 2.0 + (B-R)/(max-min)
       * If Blue is max, then Hue = 4.0 + (R-G)/(max-min)
       */
      const maxColorValue = Math.max(pixel.r, pixel.g, pixel.b);

      if (maxColorValue === pixel.r) {
        hue = (greenOpposite - blueOpposite) / difference;
      } else if (maxColorValue === pixel.g) {
        hue = 2.0 + (blueOpposite - redOpposite) / difference;
      } else {
        hue = 4.0 + (greenOpposite - blueOpposite) / difference;
      }

      hue = hue * 60; // find the sector of 60 degrees to which the color belongs

      // it should be always a positive angle
      if (hue < 0) {
        hue = hue + 360;
      }

      // When all three of R, G and B are equal, we get a neutral color: white, grey or black.
      if (difference === 0) {
        return false;
      }

      return {
        h: Math.round(hue) + 180, // plus 180 degrees because that is the complementary color
        s: parseFloat(saturation * 100).toFixed(2),
        l: parseFloat(luminance * 100).toFixed(2),
      };
    });
  };
  /**
   * Using relative luminance we order the brightness of the colors
   * the fixed values and further explanation about this topic
   * can be found here -> https://en.wikipedia.org/wiki/Luma_(video)
   */
  orderByLuminance(rgbValues) {
    const calculateLuminance = (p) => {
      return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    };

    return rgbValues.sort((p1, p2) => {
      return calculateLuminance(p2) - calculateLuminance(p1);
    });
  };
  buildRgb(imageData) {
    const rgbValues = [];
    // note that we are loopin every 4!
    // for every Red, Green, Blue and Alpha
    for (let i = 0; i < imageData.length; i += 4) {
      const rgb = {
        r: imageData[i],
        g: imageData[i + 1],
        b: imageData[i + 2],
      };

      rgbValues.push(rgb);
    }

    return rgbValues;
  };
  /**
   * Calculate the color distance or difference between 2 colors
   *
   * further explanation of this topic
   * can be found here -> https://en.wikipedia.org/wiki/Euclidean_distance
   * note: this method is not accuarate for better results use Delta-E distance metric.
   */
  calculateColorDifference(color1, color2) {
    const rDifference = Math.pow(color2.r - color1.r, 2);
    const gDifference = Math.pow(color2.g - color1.g, 2);
    const bDifference = Math.pow(color2.b - color1.b, 2);

    return rDifference + gDifference + bDifference;
  };
  // returns what color channel has the biggest difference
  findBiggestColorRange(rgbValues) {
    /**
     * Min is initialized to the maximum value posible
     * from there we procced to find the minimum value for that color channel
     *
     * Max is initialized to the minimum value posible
     * from there we procced to fin the maximum value for that color channel
     */
    let rMin = Number.MAX_VALUE;
    let gMin = Number.MAX_VALUE;
    let bMin = Number.MAX_VALUE;

    let rMax = Number.MIN_VALUE;
    let gMax = Number.MIN_VALUE;
    let bMax = Number.MIN_VALUE;

    rgbValues.forEach((pixel) => {
      rMin = Math.min(rMin, pixel.r);
      gMin = Math.min(gMin, pixel.g);
      bMin = Math.min(bMin, pixel.b);

      rMax = Math.max(rMax, pixel.r);
      gMax = Math.max(gMax, pixel.g);
      bMax = Math.max(bMax, pixel.b);
    });

    const rRange = rMax - rMin;
    const gRange = gMax - gMin;
    const bRange = bMax - bMin;

    // determine which color has the biggest difference
    const biggestRange = Math.max(rRange, gRange, bRange);
    if (biggestRange === rRange) {
      return "r";
    } else if (biggestRange === gRange) {
      return "g";
    } else {
      return "b";
    }
  };
  /**
   * Median cut implementation
   * can be found here -> https://en.wikipedia.org/wiki/Median_cut
   */
  quantization(rgbValues, depth) {
    const MAX_DEPTH = 4;

    // Base case
    if (depth === MAX_DEPTH || rgbValues.length === 0) {
      const color = rgbValues.reduce(
        (prev, curr) => {
          prev.r += curr.r;
          prev.g += curr.g;
          prev.b += curr.b;

          return prev;
        },
        {
          r: 0,
          g: 0,
          b: 0,
        }
      );

      color.r = Math.round(color.r / rgbValues.length);
      color.g = Math.round(color.g / rgbValues.length);
      color.b = Math.round(color.b / rgbValues.length);

      return [color];
    }

    /**
     *  Recursively do the following:
     *  1. Find the pixel channel (red,green or blue) with biggest difference/range
     *  2. Order by this channel
     *  3. Divide in half the rgb colors list
     *  4. Repeat process again, until desired depth or base case
     */
    const componentToSortBy = this.findBiggestColorRange(rgbValues);
    rgbValues.sort((p1, p2) => {
      return p1[componentToSortBy] - p2[componentToSortBy];
    });

    const mid = rgbValues.length / 2;
    return [
      ...this.quantization(rgbValues.slice(0, mid), depth + 1),
      ...this.quantization(rgbValues.slice(mid + 1), depth + 1),
    ];
  };
}

/*
legacy code:

bgrdImg.onload = (e) => {
  const img = e.target;
  if (img.getAttribute("cbgrdc") == "nochange") return img.setAttribute("cbgrdc", "change"); // don't change the background color
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  canvas.remove();

  const rgbArray = buildRgb(imageData.data);
  const quantColors = quantization(rgbArray, 0);

  let i = ~~(quantColors.length / 2);
  (document.body.style || pBgrd.style).backgroundColor = `rgba(${quantColors[i].r}, ${quantColors[i].g}, ${quantColors[i].b}, 1)`; // TODO: prevent very light colours
  //(document.body.style || pBgrd.style).background = createGradientRGB([quantColors[i], quantColors[i + 1]]);

  //pBgrd.style.color = (isLight(quantColors[i])) ? "black" : "white";
  //pBgrd.style.boxShadow = `-6px 0px 12px 5px rgba(${quantColors[i].r}, ${quantColors[i].g}, ${quantColors[i].b},0.6)`;

  /*const colors = buildPalette(quantColors); // gradient version (might look better with less colours in the gradient)
  console.log("gradient: ", createGradient(colors));
  /*pBgrd.style.background = createGradient(colors);
  pBgrd.style.color = (isLight(colors[~~(colors.length / 2)])) ? "black" : "white";*/
/*}*/
