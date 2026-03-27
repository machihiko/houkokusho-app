import exifr from 'exifr';

/**
 * スマホ写真のEXIF Orientationを読み取り、Canvasで向きを補正したBlobURLを返す
 * orientation値の意味:
 *   1 = 正常, 3 = 180°, 6 = 90°CW, 8 = 90°CCW
 *   2,4,5,7 = 反転系（まれ）
 */
export async function correctOrientation(file) {
  let orientation = 1;
  try {
    const exifData = await exifr.parse(file, { pick: ['Orientation'] });
    if (exifData?.Orientation) {
      orientation = exifData.Orientation;
    }
  } catch {
    // EXIFが読めない場合はそのまま返す
  }

  // orientation=1（正常）はそのままBlobURLを返す
  if (orientation === 1) {
    return URL.createObjectURL(file);
  }

  // Canvasで向き補正
  return new Promise((resolve, reject) => {
    const img = new Image();
    const originalUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(originalUrl);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // 90°/270°回転の場合は幅高さを入れ替える
      if (orientation >= 5 && orientation <= 8) {
        canvas.width = h;
        canvas.height = w;
      } else {
        canvas.width = w;
        canvas.height = h;
      }

      // orientationに応じてtransformを適用
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;          // 水平反転
        case 3: ctx.transform(-1, 0, 0, -1, w, h); break;         // 180°
        case 4: ctx.transform(1, 0, 0, -1, 0, h); break;          // 垂直反転
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;           // 90°CCW+反転
        case 6: ctx.transform(0, 1, -1, 0, h, 0); break;          // 90°CW
        case 7: ctx.transform(0, -1, -1, 0, h, w); break;         // 90°CW+反転
        case 8: ctx.transform(0, -1, 1, 0, 0, w); break;          // 90°CCW
        default: break;
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error('Canvas toBlob failed'));
          }
        },
        'image/jpeg',
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(originalUrl);
      // 読み込み失敗時はオリジナルをそのまま返す
      resolve(URL.createObjectURL(file));
    };

    img.src = originalUrl;
  });
}
