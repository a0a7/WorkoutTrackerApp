export type ThemeMode = 'light' | 'dark';

export function getThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function watchThemeMode(onChange: (theme: ThemeMode) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  const observer = new MutationObserver(() => onChange(getThemeMode()));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getSvgDimensions(svg: string): { width: number; height: number } {
  const parser = new DOMParser();
  const document = parser.parseFromString(svg, 'image/svg+xml');
  const svgElement = document.querySelector('svg');
  const width = Number(svgElement?.getAttribute('width') ?? 0);
  const height = Number(svgElement?.getAttribute('height') ?? 0);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }
  const viewBox = svgElement?.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [];
  if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value))) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return { width: 1024, height: 768 };
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const { width, height } = getSvgDimensions(svg);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create canvas context');
  }
  context.scale(scale, scale);

  const image = new Image();
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to load SVG'));
      image.src = url;
    });
    context.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create PNG blob'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

  return pngBlob;
}

export async function shareSvg(svg: string, filename: string, title: string) {
  const pngBlob = await svgToPngBlob(svg);
  const pngFile = new File([pngBlob], filename.replace(/\.svg$/i, '.png'), { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [pngFile] })) {
    await navigator.share({
      title,
      text: title,
      files: [pngFile],
    });
    return;
  }
  const url = URL.createObjectURL(pngBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/\.svg$/i, '.png');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
