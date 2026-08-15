"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Image as KonvaImage } from "react-konva";
import type { SystemDesignNodeAsset } from "../types/system-design.types";
import { getSystemDesignAssetSource } from "../utils/system-design-assets";

const loadedImages = new Map<string, HTMLImageElement>();
const pendingImages = new Map<string, Promise<HTMLImageElement>>();

function loadImage(source: string): Promise<HTMLImageElement> {
  const loaded = loadedImages.get(source);
  if (loaded) return Promise.resolve(loaded);
  const pending = pendingImages.get(source);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      loadedImages.set(source, image);
      pendingImages.delete(source);
      resolve(image);
    };
    image.onerror = () => {
      pendingImages.delete(source);
      reject(new Error("The embedded image could not be rendered."));
    };
    image.src = source;
  });
  pendingImages.set(source, promise);
  return promise;
}

function SystemDesignAssetImageComponent({
  asset,
  x,
  y,
  width,
  height,
}: {
  asset: SystemDesignNodeAsset;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const source = useMemo(() => getSystemDesignAssetSource(asset), [asset]);
  const [loadedAsset, setLoadedAsset] = useState<{
    source: string;
    image: HTMLImageElement | null;
  }>(() => ({ source, image: loadedImages.get(source) ?? null }));

  useEffect(() => {
    let active = true;
    void loadImage(source)
      .then((loaded) => {
        if (active) setLoadedAsset({ source, image: loaded });
      })
      .catch(() => {
        if (active) setLoadedAsset({ source, image: null });
      });
    return () => {
      active = false;
    };
  }, [source]);

  const image = loadedAsset.source === source ? loadedAsset.image : null;
  if (!image) return null;
  const ratio = Math.min(
    width / asset.intrinsicWidth,
    height / asset.intrinsicHeight,
  );
  const renderedWidth = asset.intrinsicWidth * ratio;
  const renderedHeight = asset.intrinsicHeight * ratio;
  return (
    <KonvaImage
      image={image}
      x={x + (width - renderedWidth) / 2}
      y={y + (height - renderedHeight) / 2}
      width={renderedWidth}
      height={renderedHeight}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

export const SystemDesignAssetImage = memo(
  SystemDesignAssetImageComponent,
);
