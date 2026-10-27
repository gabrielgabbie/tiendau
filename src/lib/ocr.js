// On-device text reading for receipt photos (Tesseract, Vietnamese + English).
// The engine and language data (~15 MB) download from the jsDelivr CDN on first use and are then
// kept in the browser's storage. The photo itself never leaves the device.

/** Shrinks and sharpens the photo for reading: greyscale, more contrast, longest side ≤ 1800px. */
async function prepare(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    ctx.filter = "grayscale(1) contrast(1.35)";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reads the text in an image. `onProgress(fraction)` goes from 0 to 1. */
export async function readImageText(file, onProgress = () => {}) {
  onProgress(0.02);
  const image = await prepare(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["vie", "eng"], 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(0.35 + 0.65 * (m.progress || 0));
      else if (/load|initializ/i.test(m.status || "")) onProgress(0.05 + 0.3 * (m.progress || 0));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    onProgress(1);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}
