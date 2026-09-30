import Image from "next/image";

type BrandLogoProps = { className?: string; align?: "start" } & (
  | { variant?: "wordmark"; tone?: "cream" | "ruby" }
  | { variant: "vertical"; tone: "ruby" }
);

// Exact v1 exports, including their protective margins. Keep the outlined
// artwork separate from .wordmark, which still styles names and headings.
export function BrandLogo({
  variant = "wordmark",
  tone = "cream",
  className = "",
  align,
}: BrandLogoProps) {
  return (
    <Image
      src={`/brand/amourette-${variant}-${tone}.svg`}
      alt="Amourette"
      width={1279.39203125}
      height={variant === "vertical" ? 559.3700377250962 : 324.376005859375}
      unoptimized
      loading="eager"
      draggable={false}
      className={`brand-logo brand-logo-${variant} ${align === "start" ? "brand-align-start" : ""} ${className}`}
    />
  );
}
