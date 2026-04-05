import type { AttachedImage } from "../hooks/useImageAttachments";

interface ImagePreviewProps {
  images: AttachedImage[];
  onRemove: (id: string) => void;
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-2">
      {images.map((img) => (
        <div
          key={img.id}
          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-300 dark:border-gray-600"
        >
          <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
          <button
            onClick={() => onRemove(img.id)}
            className="absolute -right-1 -top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-gray-800 text-xs text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
            title="Remove image"
          >
            &times;
          </button>
          <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 text-[9px] text-white">
            {img.name}
          </div>
        </div>
      ))}
    </div>
  );
}
