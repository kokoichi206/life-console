const MAX_IMAGE_EDGE = 1_600;
const JPEG_QUALITY = 0.82;

export const normalizeMealPhoto = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("画像処理用 Canvas を初期化できません。");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
