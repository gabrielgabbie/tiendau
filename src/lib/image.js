// Shrinks a picked photo for storage: longest side at most `max` px, JPEG, returned as a data URL.
export async function shrinkImage(file, { max = 1000, quality = 0.74, limit = 450_000 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable"));
      i.src = url;
    });
    let side = max, q = quality, out = "";
    // step down until it fits the size limit
    for (let tries = 0; tries < 5; tries++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL("image/jpeg", q);
      if (out.length <= limit) break;
      side = Math.round(side * 0.8); q = Math.max(0.5, q - 0.08);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
