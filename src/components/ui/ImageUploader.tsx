import { useState, useRef, useCallback } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getProductImage } from '../../lib/image';
import { useLanguage } from '../../context/LanguageContext';

const MAX_SIZE = 3 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  category: string;
  currentPath?: string | null;
  onUpload: (path: string) => void;
  onRemove?: () => void;
}

export default function ImageUploader({ category, currentPath, onUpload, onRemove }: Props) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const currentUrl = currentPath ? getProductImage(currentPath) : null;

  const uploadFile = useCallback(async (file: File) => {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(t("adminProducts.upload.invalidType"));
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(t("adminProducts.upload.tooLarge"));
      return;
    }

    setUploading(true);
    setProgress(0);

    // Compress / convert to WebP if possible
    let processedFile = file;
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      try {
        processedFile = await compressToWebP(file);
      } catch {
        // fall back to original
      }
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
      .upload(storagePath, processedFile, {
        cacheControl: '3600',
        upsert: true,
      });

    setUploading(false);
    setProgress(100);

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    onUpload(data?.path ?? storagePath);
  }, [category, onUpload, t]);

  const compressToWebP = async (file: File): Promise<File> => {
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
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      uploadFile(file);
    }
  }, [uploadFile]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      uploadFile(file);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    onRemove?.();
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-forest-500 bg-forest-50' : 'border-cream-300 hover:border-forest-400'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleSelect}
        />
        {preview || currentUrl ? (
          <div className="relative inline-block">
            <img
              src={preview || currentUrl!}
              alt="Preview"
              className="max-h-40 rounded-lg object-contain mx-auto"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            {uploading ? (
              <Loader2 size={32} className="animate-spin text-forest-500" />
            ) : (
              <>
                <Upload size={32} />
                <p className="text-sm font-medium">{t("adminProducts.upload.dragOrClick")}</p>
                <p className="text-xs">{t("adminProducts.upload.acceptedFormats")}</p>
                <p className="text-xs">{t("adminProducts.upload.maxSize")}</p>
              </>
            )}
          </div>
        )}
      </div>

      {uploading && (
        <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-forest-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
