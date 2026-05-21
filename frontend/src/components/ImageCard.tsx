import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Trash2, AlertCircle, Loader2, Eye } from 'lucide-react';
import api, { ImageGeneration, downloadImage, deleteImage } from '../lib/api';
import toast from 'react-hot-toast';

interface ImageCardProps {
  image: ImageGeneration;
  onDelete?: () => void;
  onView?: () => void;
  onAuthRequired?: () => boolean;
}

export default function ImageCard({ image, onDelete, onView, onAuthRequired }: ImageCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Fetch authenticated image blob for preview
  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | null = null;

    const loadPreview = async () => {
      if (image.status !== 'completed' || !image.image_path) {
        setPreviewUrl(null);
        setPreviewError(null);
        return;
      }

      setIsLoadingPreview(true);
      setPreviewError(null);

      try {
        console.log('PREVIEW_FETCH_START', { id: image.id });
        const response = await api.get(`/images/${image.id}/file`, {
          responseType: 'blob',
        });

        if (cancelled) return;

        const blob = response.data as Blob;
        currentObjectUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(currentObjectUrl);
          return;
        }

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        objectUrlRef.current = currentObjectUrl;
        setPreviewUrl(currentObjectUrl);
        console.log('PREVIEW_FETCH_SUCCESS', { id: image.id, size: blob.size });
      } catch (error: any) {
        if (cancelled) return;
        console.error('PREVIEW_FETCH_ERROR', { id: image.id, status: error?.response?.status, error });
        if (error?.response?.status === 403) {
          setPreviewError('Access denied — not authenticated');
        } else if (error?.response?.status === 404) {
          setPreviewError('Image file not found');
        } else {
          setPreviewError('Failed to load preview');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        objectUrlRef.current = null;
      }
    };
  }, [image.id, image.status, image.image_path]);

  // Cleanup object URL on unmount (safety net)
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleDownload = async () => {
    if (!image.image_path) {
      toast.error('Image not available');
      return;
    }

    if (!onAuthRequired?.()) {
      console.log('DOWNLOAD_AUTH_REQUIRED', { id: image.id });
      return;
    }

    try {
      setIsDownloading(true);
      const blob = await downloadImage(image.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-image-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Image downloaded');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download image');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onAuthRequired?.()) {
      console.log('DELETE_AUTH_REQUIRED', { id: image.id });
      return;
    }

    if (!confirm('Delete this image?')) return;

    try {
      setIsDeleting(true);
      await deleteImage(image.id);
      toast.success('Image deleted');
      onDelete?.();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete image');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusColor = () => {
    switch (image.status) {
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'processing':
      case 'pending':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-white/5 text-white/50 border-white/10';
    }
  };

  const getStatusIcon = () => {
    switch (image.status) {
      case 'pending':
      case 'processing':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const hasImage = image.status === 'completed' && image.image_path;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group relative bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] rounded-2xl overflow-hidden border border-white/10 hover:border-[#7c5cff]/50 transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(124,92,255,0.3)]"
    >
      {/* Image Container */}
      <div className="relative w-full aspect-square bg-black/30">
        {hasImage ? (
          <>
            {isLoadingPreview && !previewUrl ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={image.prompt}
                className="w-full h-full object-cover"
              />
            ) : previewError ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-xs text-red-300 text-center">{previewError}</p>
              </div>
            ) : null}

            {previewUrl && image.status === 'completed' && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setShowPreview(true);
                    onView?.();
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20"
                >
                  <Eye className="w-5 h-5 text-white" />
                </motion.button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            {image.status === 'pending' || image.status === 'processing' ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                <p className="text-xs text-white/50">Generating...</p>
              </>
            ) : image.status === 'failed' ? (
              <>
                <AlertCircle className="w-8 h-8 text-red-400" />
                <p className="text-xs text-red-300 text-center px-2">Generation failed</p>
              </>
            ) : (
              <p className="text-xs text-white/50">No image</p>
            )}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-3 bg-[#0f0f1e]/80 backdrop-blur-sm border-t border-white/5">
        {/* Status Badge */}
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border mb-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="capitalize">{image.status}</span>
        </div>

        {/* Prompt */}
        <p className="text-xs text-white/70 line-clamp-2 mb-2 group-hover:line-clamp-none transition-all">
          {image.prompt}
        </p>

        {/* Metadata */}
        <div className="text-[10px] text-white/40 space-y-1 mb-3">
          <p>
            {image.generation_time_seconds
              ? `${image.generation_time_seconds.toFixed(1)}s`
              : 'Pending'}
          </p>
          <p>{new Date(image.created_at).toLocaleDateString()}</p>
        </div>

        {/* Error Message */}
        {image.error_message && (
          <p className="text-[10px] text-red-300 mb-2 line-clamp-2">
            Error: {image.error_message}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDownload}
            disabled={isDownloading || !hasImage}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-gradient-to-r from-[#7c5cff] to-[#3b82f6] text-white text-xs font-semibold hover:shadow-lg hover:shadow-[#7c5cff]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isDownloading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Download className="w-3 h-3" />
                Download
              </>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-semibold border border-red-500/20 hover:border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
