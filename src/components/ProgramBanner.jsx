import { useState } from "react";
import { ImageOff } from "lucide-react";
import { getProgramBanner } from "../data/programBanners";

const cardSizes = "(max-width: 680px) calc(100vw - 3rem), (max-width: 1024px) 50vw, (max-width: 1279px) 33vw, 25vw";
const detailSizes = "(max-width: 1180px) calc(100vw - 2rem), 1120px";

export default function ProgramBanner({ program, placement = "card" }) {
  const [failedSrc, setFailedSrc] = useState("");
  const banner = getProgramBanner(program?.slug);
  const isDetail = placement === "detail";
  const title = program?.title || "Zentel Insight programme";
  const failed = Boolean(banner && failedSrc === banner.src);

  return (
    <figure className={`program-banner program-banner--${placement}`}>
      {banner && !failed ? (
        <img
          src={banner.src}
          alt={`${title} programme banner`}
          width={banner.width}
          height={banner.height}
          loading={isDetail ? "eager" : "lazy"}
          fetchPriority={isDetail ? "high" : "auto"}
          decoding="async"
          sizes={isDetail ? detailSizes : cardSizes}
          onError={() => setFailedSrc(banner.src)}
        />
      ) : (
        <div className="program-banner__fallback" role="img" aria-label={`${title} programme banner unavailable`}>
          <ImageOff size={28} aria-hidden="true" />
          <strong>{title}</strong>
          <span>Programme banner unavailable</span>
        </div>
      )}
    </figure>
  );
}
