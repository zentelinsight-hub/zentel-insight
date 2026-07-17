import { useState } from "react";
import { siteConfig } from "../data/site";

const logoSizes = {
  small: 42,
  medium: 48,
  footer: 52,
  auth: 64,
  portal: 48,
  payment: 72,
  receipt: 64,
  large: 80
};

export default function BrandLogo({ brand = "main", className = "", size = "medium", width, height }) {
  const config = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const [failed, setFailed] = useState(false);
  const numericSize =
    typeof size === "number" ? size : logoSizes[size] || Math.max(Number(width) || 0, Number(height) || 0) || logoSizes.medium;
  const classes = ["brand-logo-frame", `brand-logo-${typeof size === "string" ? size : "custom"}`, className]
    .filter(Boolean)
    .join(" ");
  const style = { "--logo-size": `${numericSize}px` };

  if (failed) {
    return (
      <span className={`${classes} brand-logo-fallback`} style={style}>
        {config.name}
      </span>
    );
  }

  return (
    <span className={classes} style={style}>
      <img
        src={config.logo}
        alt={config.name}
        className="brand-logo"
        width={numericSize}
        height={numericSize}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
