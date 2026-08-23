import { useState, useRef, useCallback } from 'react';
import { Upload, X, ChevronLeft, ChevronRight, Star, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getProductImage } from '../../lib/image';
import { useLanguage } from '../../context/LanguageContext';

const MAX_SIZE = 3 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGES = 5;

interface Props {
  category: string;
  images: string[];
  onChange: (images: string[]) => void;
}

function compressToWebP(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression failed')); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
      }, 'image/webp', 0.85);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export default function MultiImageUploader({ category, images, onChange }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null);
    if (!ACCEPTED.includes(file.type)) {
      setUploadError(t("adminProducts.upload.invalidType"));
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(t("adminProducts.upload.tooLarge"));
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    let processedFile = file;
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      try {
        processedFile = await compressToWebP(file);
      } catch { /* fall back to original */ }
    }
    const ext = processedFile.type === 'image/webp' ? 'webp' : processedFile.name.split('.').pop();
    const name = file.name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const storagePath = `${category.toLowerCase()}/${name}.${ext}`;
    const { data, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, processedFile, { cacheControl: '3600', upsert: true });
    setUploading(false);
    setUploadProgress(100);
    if (uploadError) {
      setUploadError(uploadError.message);
      return;
    }
    onChange([...images, data?.path ?? storagePath]);
  }, [category, images, onChange, t]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    URL.createObjectURL(file);
    uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const moveLeft = (index: number) => {
    if (index === 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveRight = (index: number) => {
    if (index === images.length - 1) return;
    const next = [...images];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const removeImage = async (index: number) => {
    const path = images[index];
    await supabase.storage.from('product-images').remove([path]);
    const next = images.filter((_, i) => i !== index);
    onChange(next);
  };

  const setAsMain = (index: number) => {
    if (index === 0) return;
    const next = [...images];
    [next[0], next[index]] = [next[index], next[0]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {images.map((path, i) => (
          <div key={path} className="relative group aspect-square rounded-xl overflow-hidden border border-cream-200 bg-cream-50">
            <img
              src={getProductImage(path)}
              alt=""
              className="w-full h-full object-cover"
            />
            {i === 0 && (
              <div className="absolute top-1 left-1 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow">
                <Star size={10} className="fill-yellow-900" /> MAIN
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
              {i > 0 && (
                <button type="button" onClick={() => setAsMain(i)} title={t("adminProducts.upload.setAsMain")}
                  className="p-1.5 bg-white/90 rounded-full hover:bg-white transition-colors text-gray-700">
                  <Star size={14} />
                </button>
              )}
              {i > 0 && (
                <button type="button" onClick={() => moveLeft(i)} title={t("adminProducts.upload.moveLeft")}
                  className="p-1.5 bg-white/90 rounded-full hover:bg-white transition-colors text-gray-700">
                  <ChevronLeft size={14} />
                </button>
              )}
              {i < images.length - 1 && (
                <button type="button" onClick={() => moveRight(i)} title={t("adminProducts.upload.moveRight")}
                  className="p-1.5 bg-white/90 rounded-full hover:bg-white transition-colors text-gray-700">
                  <ChevronRight size={14} />
                </button>
              )}
              <button type="button" onClick={() => removeImage(i)} title={t("adminProducts.upload.deleteImage")}
                className="p-1.5 bg-red-500/90 rounded-full hover:bg-red-600 transition-colors text-white">
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
        {images.length < MAX_IMAGES && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
              dragOver ? 'border-forest-500 bg-forest-50' : 'border-cream-300 hover:border-forest-400'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {uploading ? (
              <Loader2 size={24} className="animate-spin text-forest-500" />
            ) : (
              <>
                <Upload size={22} className="text-gray-400" />
                <span className="text-[11px] text-gray-400 text-center leading-tight px-1">
                  {t("adminProducts.upload.dragOrClick")}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {uploading && (
        <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
          <div className="bg-forest-500 h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}

      {images.length === 0 && !uploading && (
        <p className="text-xs text-gray-400 text-center">{t("adminProducts.upload.noImages")}</p>
      )}
    </div>
  );
}