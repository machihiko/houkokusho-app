import { useState, useRef } from 'react';
import exifr from 'exifr';
import { Camera, X, Image } from 'lucide-react';
import { correctOrientation } from '../../utils/correctOrientation';
import { compressImage } from '../../utils/imageCompression';
import './PhotoUploader.css';

const MAX_PHOTOS = 10;

// YYYY-MM-DD 文字列に変換
const toDateStr = (date) => date.toISOString().split('T')[0];

// 表示用に YYYY/MM/DD 形式に変換
const toDisplayDate = (yyyymmdd) => yyyymmdd.replace(/-/g, '/');

const PhotoUploader = ({ photos, setPhotos, onDateExtracted, currentDate = '' }) => {
  const [error,         setError]         = useState('');
  const [modalUrl,      setModalUrl]      = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);

  // 2種類のファイル入力への参照（capture 属性の有無で分ける）
  const cameraInputRef  = useRef(null);
  const libraryInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    setError('');
    setIsCompressing(true);

    const newPhotos = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;

      // EXIF Orientation 補正済み URL を取得（プレビュー表示用）
      const url = await correctOrientation(file);

      // 画像圧縮（Supabase Storageアップロード用に軽量化）
      const compressedFile = await compressImage(file);

      // ── EXIF 撮影日を取得（元ファイルから読む）──────
      let exifDateStr = null;
      try {
        const exifData = await exifr.parse(file);
        if (exifData?.DateTimeOriginal) {
          exifDateStr = toDateStr(new Date(exifData.DateTimeOriginal));
        }
      } catch {
        // EXIFが読めない場合は無視（通常の追加として扱う）
      }

      // ── 作業日との照合 ──────────────────────────────
      if (exifDateStr) {
        if (!currentDate) {
          // 作業日が空欄 → 撮影日で自動セット（アラートなし）
          onDateExtracted(new Date(exifDateStr + 'T00:00:00'));
        } else if (exifDateStr !== currentDate) {
          // 作業日と撮影日が不一致 → 確認ダイアログ
          const ok = window.confirm(
            `写真の撮影日（${toDisplayDate(exifDateStr)}）が\n` +
            `作業日（${toDisplayDate(currentDate)}）と異なります。\n\n` +
            `このまま追加しますか？`
          );
          if (!ok) continue; // キャンセル → この写真をスキップ
        }
        // dates match → そのまま追加
      }

      // プレビューは向き補正済みURL、アップロードは圧縮済みFile
      newPhotos.push({ file: compressedFile, url, name: file.name });
    }

    setIsCompressing(false);
    if (newPhotos.length === 0) return;

    const merged = [...photos, ...newPhotos];
    if (merged.length > MAX_PHOTOS) {
      setError(`写真は最大${MAX_PHOTOS}枚までです。${MAX_PHOTOS}枚を超えた分は追加されませんでした。`);
      setPhotos(merged.slice(0, MAX_PHOTOS));
    } else {
      setPhotos(merged);
    }

    // 同じファイルを再選択できるようにリセット
    e.target.value = '';
  };

  const removePhoto = (index) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-uploader">
      <div className="upload-header">
        <label>現場写真 (最大{MAX_PHOTOS}枚)</label>
        <span className="photo-count">{photos.length}/{MAX_PHOTOS}</span>
      </div>

      {/* 横スクロールコンテナ */}
      <div className="photo-scroll-track">
        <div className="photo-scroll-inner">
          {photos.map((photo, index) => (
            <div key={index} className="photo-item">
              <img
                src={photo.url}
                alt={`preview ${index + 1}`}
                onClick={() => setModalUrl(photo.url)}
                className="photo-thumb"
              />
              <button
                type="button"
                className="remove-photo-btn"
                onClick={() => removePhoto(index)}
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              className={`upload-btn${isCompressing ? ' upload-btn--compressing' : ''}`}
              onClick={() => !isCompressing && setShowMenu(v => !v)}
            >
              {isCompressing ? (
                <>
                  <span className="compress-spinner" />
                  <span>圧縮中...</span>
                </>
              ) : (
                <>
                  <Camera size={22} color="var(--primary)" />
                  <span>追加</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* カメラ/ライブラリ 選択メニュー */}
      {showMenu && (
        <div className="photo-menu">
          <button
            type="button"
            className="photo-menu-item"
            onClick={() => {
              setShowMenu(false);
              cameraInputRef.current?.click();
            }}
          >
            <Camera size={18} />
            カメラを起動
          </button>
          <button
            type="button"
            className="photo-menu-item"
            onClick={() => {
              setShowMenu(false);
              libraryInputRef.current?.click();
            }}
          >
            <Image size={18} />
            ライブラリから選ぶ
          </button>
        </div>
      )}

      {/* 隠しファイル入力：カメラ起動用（capture あり） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={isCompressing}
      />
      {/* 隠しファイル入力：ライブラリ選択用（capture なし） */}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={isCompressing}
      />

      {error && <div className="error-text mt-2">{error}</div>}

      {/* 拡大モーダル */}
      {modalUrl && (
        <div className="photo-modal-overlay" onClick={() => setModalUrl(null)}>
          <img
            src={modalUrl}
            alt="拡大表示"
            className="photo-modal-img"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            className="photo-modal-close"
            onClick={() => setModalUrl(null)}
          >
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
};

export default PhotoUploader;
