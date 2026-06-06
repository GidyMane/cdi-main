import React, { useRef } from "react";
import { X, Download } from "lucide-react";
import { BulletinReport } from "./BulletinReport";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface BulletinDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const BulletinDownloadModal: React.FC<BulletinDownloadModalProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  if (!isOpen) return null;

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;

    setIsDownloading(true);
    try {
      // Capture the report as canvas
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      // Convert to PDF
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

      // Generate filename with date
      const date = new Date();
      const filename = `Uganda_Multi-Hazard_Bulletin_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.pdf`;

      pdf.save(filename);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // const handlePrint = () => {
  //   window.print();
  // };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={onClose}
        style={{ animation: "fadeIn 0.2s ease-out" }}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto"
        style={{ animation: "slideUp 0.3s ease-out" }}
      >
        <div
          className="relative w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden"
          style={{
            backgroundColor: isDarkMode ? "#1e293b" : "#ffffff",
            maxHeight: "90vh",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{
              backgroundColor: isDarkMode ? "#0f172a" : "#f8fafc",
              borderColor: isDarkMode ? "#334155" : "#e2e8f0",
            }}
          >
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: isDarkMode ? "#f1f5f9" : "#0f172a" }}
              >
                Multi-Hazard Bulletin Report
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              >
                Preview and download the bulletin report
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* <button
                onClick={handlePrint}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: "#6366f1",
                  color: "#ffffff",
                }}
              >
                <Printer className="w-4 h-4" />
                Print
              </button> */}

              <button
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: "#318DDE",
                  color: "#ffffff",
                }}
              >
                <Download className="w-4 h-4" />
                {isDownloading ? "Generating..." : "Download PDF"}
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-all hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Report Preview */}
          <div
            className="overflow-y-auto"
            style={{
              maxHeight: "calc(90vh - 80px)",
              backgroundColor: "#f5f5f5",
            }}
          >
            <div className="p-6">
              <div ref={reportRef}>
                <BulletinReport isDarkMode={false} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media print {
          body * {
            visibility: hidden;
          }
          
          .bulletin-report,
          .bulletin-report * {
            visibility: visible;
          }
          
          .bulletin-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 210mm;
            height: 297mm;
          }
        }
      `}</style>
    </>
  );
};
