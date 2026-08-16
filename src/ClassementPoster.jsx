import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Download } from "lucide-react";

/**
 * Poster de classement exportable en image (PNG x2 pour une bonne netteté).
 * Props :
 *  - poolName, eventName : titres affichés en en-tête
 *  - theme: { primary, accent }
 *  - slogan, location : bannière de pied de page
 *  - socials: { instagram, facebook }
 *  - teams: [{ rank, name, logo, mj, bt, be, gd, pts }]
 */
export default function ClassementPoster({ poolName, eventName, theme, slogan, location, socials, teams }) {
  const posterRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const primary = theme?.primary || "#0D2818";
  const accent = theme?.accent || "#F5A623";

  const sorted = [...(teams || [])].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.bt - a.bt;
  });

  async function exportPNG() {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(posterRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const link = document.createElement("a");
      link.download = `classement-${(poolName || "poule").replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Échec de l'export PNG :", err);
      alert("Échec de l'export de l'image : " + (err?.message || err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={exportPNG}
          disabled={exporting}
          className="px-4 py-2 rounded-lg font-semibold text-sm text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: primary }}
        >
          <Download size={16} />{exporting ? "Export en cours..." : "Exporter en PNG"}
        </button>
      </div>

      <div ref={posterRef} style={{ background: "#ffffff", fontFamily: "'Inter', sans-serif", width: 720 }}>
        <div style={{ background: primary, padding: "28px 32px", color: "#fff" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>{eventName}</div>
          <div style={{ fontSize: 30, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>{poolName}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F5F1E8" }}>
              {["RANG", "ÉQUIPE", "MJ", "BT", "BE", "GD", "PTS"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 1 ? "left" : "center",
                    padding: "10px 12px",
                    fontSize: 11,
                    letterSpacing: 1,
                    color: "#6b6b60",
                    borderBottom: `2px solid ${accent}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee", background: i % 2 === 0 ? "#fff" : "#FAFAF6" }}>
                <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, color: primary }}>{t.rank ?? i + 1}</td>
                <td style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  {t.logo ? (
                    <img src={t.logo} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: "#e5e1d3" }} />
                  )}
                  <span style={{ fontWeight: 700 }}>{t.name}</span>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{t.mj}</td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{t.bt}</td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{t.be}</td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 900, color: accent }}>{t.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {(slogan || location || socials?.instagram || socials?.facebook) && (
          <div style={{ background: primary, color: "#fff", padding: "16px 32px", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {slogan && <div style={{ fontWeight: 800, fontSize: 14 }}>{slogan}</div>}
              {location && <div style={{ opacity: 0.7 }}>{location}</div>}
            </div>
            <div style={{ textAlign: "right", opacity: 0.85 }}>
              {socials?.instagram && <div>{socials.instagram}</div>}
              {socials?.facebook && <div>{socials.facebook}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
