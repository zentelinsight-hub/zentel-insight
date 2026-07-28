import { useState } from "react";
import { ImageOff } from "lucide-react";
import { getPageVisual } from "../data/pageVisuals";

const responsiveSizes = "(max-width: 1180px) calc(100vw - 1rem), 1120px";

export default function PageVisual({ visualKey, placement = "public" }) {
  const [failedSrc, setFailedSrc] = useState("");
  const visual = getPageVisual(visualKey);
  const failed = Boolean(visual && failedSrc === visual.src);
  const label = visual?.alt || "Zentel Insight page illustration";

  return (
    <figure className={`page-visual page-visual--${placement}`}>
      {visual && !failed ? (
        <img
          src={visual.src}
          alt={visual.alt}
          width={visual.width}
          height={visual.height}
          loading={visual.loading}
          fetchPriority={visual.loading === "eager" ? "high" : "auto"}
          decoding="async"
          sizes={responsiveSizes}
          onError={() => setFailedSrc(visual.src)}
        />
      ) : (
        <div className="page-visual__fallback" role="img" aria-label={`${label} unavailable`}>
          <ImageOff size={30} aria-hidden="true" />
          <strong>Page illustration unavailable</strong>
          <span>The rest of this page is still available.</span>
        </div>
      )}
    </figure>
  );
}
