import React from "react";

interface BulletinReportProps {
  date?: Date;
  bulletinNumber?: string;
  isDarkMode?: boolean;
}

export const BulletinReport: React.FC<BulletinReportProps> = ({
  date = new Date(),
  bulletinNumber,
  // isDarkMode = false,
}) => {
  const bulletinId =
    bulletinNumber ||
    `UGA-MH-${date.getFullYear()}-${String(Math.floor(date.getTime() / 86400000)).slice(-3)}`;
  const formattedDate = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="bulletin-report"
      style={{
        width: "210mm",
        minHeight: "297mm",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: "1.4",
        padding: 0,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "#318DDE",
          padding: "15px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <img
            src="/fao-white.png"
            alt="FAO"
            style={{ height: "50px", objectFit: "contain" }}
          />
        </div>
        <div style={{ textAlign: "right", color: "#ffffff" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "16pt",
              fontWeight: "bold",
              letterSpacing: "0.5px",
            }}
          >
            UGANDA MULTI-HAZARD
          </h1>
          <h2
            style={{
              margin: "2px 0 0 0",
              fontSize: "14pt",
              fontWeight: "bold",
            }}
          >
            EARLY WARNING BULLETIN
          </h2>
          <p style={{ margin: "8px 0 0 0", fontSize: "9pt" }}>
            {formattedDate} | Bulletin #{bulletinId}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: "20px" }}>
        {/* Two Column Layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "15px",
            marginBottom: "15px",
          }}
        >
          {/* Weather Situation and Forecast */}
          <div
            style={{
              backgroundColor: "#E8F4FD",
              padding: "12px",
              borderLeft: "4px solid #318DDE",
            }}
          >
            <h3
              style={{
                margin: "0 0 10px 0",
                fontSize: "11pt",
                fontWeight: "bold",
                color: "#318DDE",
                textTransform: "uppercase",
              }}
            >
              Weather Situation and Forecast
            </h3>
            <div style={{ fontSize: "9pt", lineHeight: "1.5" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                Current Conditions:
              </p>
              <p style={{ margin: "0 0 10px 0" }}>
                Moderate to heavy rainfall has been observed across northern and
                eastern regions over the past 24 hours, with amounts ranging
                from 20-60mm. Central regions experienced light to moderate
                showers (5-25mm), while western areas remained relatively dry.
                Temperatures have been within normal seasonal ranges (20-28°C).
              </p>

              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                7-Day Forecast (Next Week):
              </p>
              <p style={{ margin: "0 0 10px 0" }}>
                Rainfall is expected to continue across most parts of the
                country, with above-normal amounts anticipated in the Lake
                Victoria basin and eastern highlands. Northern regions should
                prepare for thunderstorms with localized heavy downpours. The
                cattle corridor may experience scattered showers, improving
                pasture conditions.
              </p>

              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                Regional Outlook:
              </p>
              <ul style={{ margin: "0", paddingLeft: "18px" }}>
                <li>
                  Northern: Heavy rainfall with thunderstorms, 40-80mm expected
                </li>
                <li>
                  Eastern: Moderate to heavy showers, possible flash floods
                </li>
                <li>
                  Central: Scattered rainfall, generally favorable conditions
                </li>
                <li>
                  Western: Light to moderate showers, improving moisture levels
                </li>
              </ul>
            </div>
          </div>

          {/* Agrometeorological / Drought Situation */}
          <div
            style={{
              backgroundColor: "#FFF3E0",
              padding: "12px",
              borderLeft: "4px solid #FF9800",
            }}
          >
            <h3
              style={{
                margin: "0 0 10px 0",
                fontSize: "11pt",
                fontWeight: "bold",
                color: "#FF9800",
                textTransform: "uppercase",
              }}
            >
              Agrometeorological / Drought Situation
            </h3>
            <div style={{ fontSize: "9pt", lineHeight: "1.5" }}>
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                Soil Moisture and Crop Conditions:
              </p>
              <p style={{ margin: "0 0 10px 0" }}>
                Soil moisture levels have improved significantly in most
                agricultural zones following recent rainfall. First season crops
                are at various vegetative stages with generally good growth
                observed in central and eastern regions. However, the cattle
                corridor continues to experience moisture stress requiring close
                monitoring.
              </p>

              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                Water Availability:
              </p>
              <p style={{ margin: "0 0 10px 0" }}>
                Water sources are generally adequate for both domestic and
                agricultural use. Major water bodies including Lakes Victoria,
                Kyoga, and Albert are at normal levels. Some boreholes in
                Karamoja sub-region continue to report reduced yields, requiring
                water trucking in isolated areas.
              </p>

              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
                Agricultural Advisory:
              </p>
              <ul style={{ margin: "0", paddingLeft: "18px" }}>
                <li>Continue land preparation and timely planting</li>
                <li>Apply fertilizers during rainfall periods</li>
                <li>Monitor and control Fall Armyworm infestations</li>
                <li>Prepare drainage systems in flood-prone areas</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Rainfall Chart Placeholder */}
        <div
          style={{
            backgroundColor: "#F5F5F5",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "4px",
            border: "1px solid #E0E0E0",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px 0",
              fontSize: "11pt",
              fontWeight: "bold",
              color: "#424242",
            }}
          >
            Cumulative Rainfall by District (Last 30 Days)
          </h3>
          <div
            style={{
              height: "180px",
              backgroundColor: "#ffffff",
              border: "1px solid #E0E0E0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9E9E9E",
              fontSize: "9pt",
            }}
          >
            [Bar Chart: Rainfall data visualization]
          </div>
          <p style={{ fontSize: "8pt", color: "#757575", margin: "8px 0 0 0" }}>
            Source: UNMA Weather Stations Network | Data as of {formattedDate}
          </p>
        </div>

        {/* Regional Analysis */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "15px",
            marginBottom: "15px",
          }}
        >
          {/* Karamoja Region */}
          <div style={{ fontSize: "9pt" }}>
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "10pt",
                fontWeight: "bold",
                color: "#424242",
                borderBottom: "2px solid #318DDE",
                paddingBottom: "4px",
              }}
            >
              Karamoja Region Analysis
            </h3>
            <p style={{ margin: "0 0 8px 0" }}>
              <strong>Situation:</strong> Dry conditions persist with
              below-normal rainfall recorded. Pasture and water availability
              remain a concern. Livestock body conditions deteriorating in some
              areas.
            </p>
            <p style={{ margin: "0" }}>
              <strong>Advisory:</strong> Continue water trucking operations.
              Monitor livestock health closely. Supplement animal feed where
              necessary.
            </p>
          </div>

          {/* Lake Victoria Basin */}
          <div style={{ fontSize: "9pt" }}>
            <h3
              style={{
                margin: "0 0 8px 0",
                fontSize: "10pt",
                fontWeight: "bold",
                color: "#424242",
                borderBottom: "2px solid #06B6D4",
                paddingBottom: "4px",
              }}
            >
              Lake Victoria Basin
            </h3>
            <p style={{ margin: "0 0 8px 0" }}>
              <strong>Situation:</strong> Above-normal rainfall causing
              localized flooding in low-lying areas. Lake levels rising
              gradually. Some fishing activities disrupted by rough waters.
            </p>
            <p style={{ margin: "0" }}>
              <strong>Advisory:</strong> Communities in flood-prone areas should
              remain vigilant. Strengthen drainage systems. Fishermen advised to
              exercise caution.
            </p>
          </div>
        </div>

        {/* Flood Risk / Hydrological Situation */}
        <div
          style={{
            backgroundColor: "#E1F5FE",
            padding: "12px",
            marginBottom: "15px",
            borderLeft: "4px solid #06B6D4",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px 0",
              fontSize: "11pt",
              fontWeight: "bold",
              color: "#06B6D4",
              textTransform: "uppercase",
            }}
          >
            Hydrological Situation / Flood Risk
          </h3>
          <div style={{ fontSize: "9pt", lineHeight: "1.5" }}>
            <p style={{ margin: "0 0 10px 0" }}>
              River discharge rates are elevated in several basins following
              recent heavy rainfall. Three river basins (Aswa, Mpologoma, and
              Katonga) are currently under flood watch with discharge rates
              approaching moderate flood thresholds. Communities along these
              river systems should remain alert.
            </p>
            <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
              Districts on Flood Watch:
            </p>
            <p style={{ margin: "0" }}>
              Lira, Soroti, Pallisa, Butaleja, Kyotera, Rakai, Mityana, Mubende
              (partial)
            </p>
          </div>
        </div>

        {/* Food Security Status */}
        <div
          style={{
            backgroundColor: "#FFF9E6",
            padding: "12px",
            marginBottom: "15px",
            borderLeft: "4px solid #FFC107",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px 0",
              fontSize: "11pt",
              fontWeight: "bold",
              color: "#F57C00",
              textTransform: "uppercase",
            }}
          >
            Food Security Outlook
          </h3>
          <div style={{ fontSize: "9pt", lineHeight: "1.5" }}>
            <p style={{ margin: "0 0 10px 0" }}>
              Overall food security situation remains stable across most
              regions. However, pockets of concern exist in parts of Karamoja
              where consecutive dry spells have affected crop production. First
              season harvest prospects are favorable in central, eastern, and
              western regions with adequate rainfall received during critical
              growth stages.
            </p>
            <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>
              Market Situation:
            </p>
            <p style={{ margin: "0" }}>
              Staple food prices remain within normal ranges. Maize and beans
              are readily available in most markets. Minor price increases
              observed in northern districts due to transportation challenges
              during wet season.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          backgroundColor: "#F5F5F5",
          padding: "12px 20px",
          borderTop: "3px solid #318DDE",
          fontSize: "8pt",
        }}
      >
        <div style={{ marginBottom: "10px" }}>
          <p style={{ margin: "0 0 4px 0", fontWeight: "bold" }}>
            Contact Information:
          </p>
          <p style={{ margin: 0 }}>
            Food and Agriculture Organization of the United Nations (FAO) Uganda
            | Uganda National Meteorological Authority (UNMA) | Office of the
            Prime Minister - Department of Disaster Preparedness
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
              flexWrap: "wrap",
            }}
          >
            <img
              src="/fao_logo_3lines_en1.png"
              alt="FAO"
              style={{ height: "30px" }}
            />
            <div style={{ fontSize: "7pt", color: "#757575" }}>
              <p style={{ margin: 0 }}>Supported by:</p>
              <p style={{ margin: 0 }}>EU, UK Aid, Canada, Sweden</p>
            </div>
          </div>
          <div
            style={{ textAlign: "right", fontSize: "7pt", color: "#757575" }}
          >
            <p style={{ margin: 0 }}>
              <strong>Validity:</strong> 24 hours from issue time
            </p>
            <p style={{ margin: 0 }}>
              <strong>Next Update:</strong>{" "}
              {new Date(date.getTime() + 86400000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .bulletin-report {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: 0;
            page-break-after: always;
          }
          
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
};
