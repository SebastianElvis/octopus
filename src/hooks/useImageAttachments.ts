import { useState, useCallback } from "react";

export interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string; // for preview rendering
  base64: string; // raw base64 without data URL prefix
  mimeType: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function processImageFile(file: File): Promise<AttachedImage | null> {
  if (!ACCEPTED_TYPES.includes(file.type)) return null;
  if (file.size > MAX_IMAGE_SIZE) return null;

  const dataUrl = await readFileAsDataUrl(file);
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const ext = file.type.split("/")[1] ?? "png";
  const name = file.name || `paste-${Date.now()}.${ext}`;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    dataUrl,
    base64: parsed.base64,
    mimeType: parsed.mimeType,
  };
}

export function useImageAttachments() {
  const [images, setImages] = useState<AttachedImage[]>([]);

  const addImage = useCallback((img: AttachedImage) => {
    setImages((prev) => [...prev, img]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setImages([]);
  }, []);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;

      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const img = await processImageFile(file);
        if (img) addImage(img);
      }
    },
    [addImage],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;

      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const img = await processImageFile(file);
        if (img) addImage(img);
      }
    },
    [addImage],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    images,
    addImage,
    removeImage,
    clearImages,
    handlePaste,
    handleDrop,
    handleDragOver,
  };
}
