const MAX_IMAGE_EDGE = 1_600;
const JPEG_QUALITY = 0.82;

export const normalizeMealPhoto = async (file: File, quarterTurns = 0): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const swapsDimensions = quarterTurns % 2 !== 0;
  canvas.width = swapsDimensions ? height : width;
  canvas.height = swapsDimensions ? width : height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("画像処理用 Canvas を初期化できません。");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(quarterTurns * Math.PI / 2);
  context.drawImage(bitmap, -width / 2, -height / 2, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("写真を JPEG に変換できません。"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY);
  });
};
