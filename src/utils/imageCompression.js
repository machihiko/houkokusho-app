/**
 * imageCompression.js
 * HTML5 Canvas API を使った画像圧縮ユーティリティ
 * 外部ライブラリ不使用・FileReader + Canvas のみ
 */

/**
 * 画像ファイルを圧縮して JPEG の File オブジェクトを返す
 *
 * @param {File}   file       - 元の画像ファイル
 * @param {number} maxWidth   - リサイズ上限幅（px）。これ以下の画像はリサイズしない
 * @param {number} quality    - JPEG 品質（0.0〜1.0）
 * @returns {Promise<File>}   - 圧縮後の File（JPEG）。失敗時は元ファイルをそのまま返す
 */
export const compressImage = (file, maxWidth = 1200, quality = 0.8) =>
  new Promise((resolve) => {
    // 画像以外（PDF 等）はそのまま返す
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();

    reader.onload = ({ target: { result } }) => {
      const img = new Image();

      img.onload = () => {
        // maxWidth 以下の画像はリサイズ不要（品質圧縮のみ行う）
        const needsResize = img.width > maxWidth;
        const outW = needsResize ? maxWidth : img.width;
        const outH = needsResize ? Math.round(img.height * (maxWidth / img.width)) : img.height;

        const canvas = document.createElement('canvas');
        canvas.width  = outW;
        canvas.height = outH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, outW, outH);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              // Canvas toBlob が失敗した場合は元ファイルで続行
              resolve(file);
              return;
            }
            // 拡張子を .jpg に統一（元ファイル名のベースを維持）
            const baseName = file.name.replace(/\.[^.]+$/, '');
            resolve(
              new File([blob], `${baseName}.jpg`, {
                type:         'image/jpeg',
                lastModified: Date.now(),
              }),
            );
          },
          'image/jpeg',
          quality,
        );
      };

      img.onerror = () => resolve(file); // 読み込みエラー → 元ファイルで続行
      img.src = result;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
