import { useState } from "react";

interface ProviderIconProps {
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
  fallbackText?: string;
  fallbackColor?: string;
}

/**
 * ProviderIcon component displays a provider logo with a fallback to text icon.
 * If the image fails to load or no src is provided, it shows a colored text icon.
 */
export function ProviderIcon({
  src,
  alt = "Provider",
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}: ProviderIconProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
