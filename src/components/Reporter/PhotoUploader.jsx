import React, { useState } from 'react';
import exifr from 'exifr';
import { Camera, X } from 'lucide-react';
import { correctOrientation } from '../../utils/correctOrientation';
import './PhotoUploader.css';

const PhotoUploader = ({ onDateExtracted, photos, setPhotos }) => {
  const [error, setError] = useState('');
  // 拡大表示するBlobURL（nullなら非表示）
  const [modalUrl, setModalUrl] = useState(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);

    if (photos.length + files.length > 3) {
      setError('写真は最大3枚までです。');
      return;
    }

    setError('');

    const newPhotos = [];

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // EXIF Orientationを補正した向き正しいURLを取得
        const url = await correctOrientation(file);

        try {
          const exifData = await exifr.parse(file);
          if (exifData && exifData.DateTimeOriginal) {
            onDateExtracted(new Date(exifData.DateTimeOriginal));
          }
        } catch (err) {
          console.warn('EXIF extraction failed', err);
        }

        newPhotos.push({ file, url, name: file.name });
      }
    }

    setPhotos(prev => [...prev, ...newPhotos].slice(0, 3));
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-uploader">
      <div className="upload-header">
        <label>現場写真 (最大3枚)</label>
        <span className="photo-count">{photos.length}/3</span>
      </div>

      <div className="photo-grid">
        {photos.map((photo, index) => (
          <div key={index} className="photo-preview">
            {/* クリックで拡大モーダルを開く */}
            <img
              src={photo.url}
              alt={`preview ${index}`}
              onClick={() => setModalUrl(photo.url)}
              className="photo-thumb"
            />
            <button type="button" className="remove-photo-btn" onClick={() => removePhoto(index)}>
              <X size={14} />
            </button>
          </div>
        ))}

        {photos.length < 3 && (
          <label className="upload-btn">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <Camera size={24} color="var(--primary)" />
            <span>写真追加</span>
          </label>
        )}
      </div>

      {error && <div className="error-text mt-2">{error}</div>}

      {/* 拡大モーダル：オーバーレイクリックで閉じる */}
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
