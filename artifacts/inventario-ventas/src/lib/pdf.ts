export async function downloadPdfFromHtml(htmlContent: string, fileName: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // Render HTML in a hidden fixed iframe (same origin → html2canvas works)
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:816px;height:1056px;visibility:hidden;border:none;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Allow images (logo) time to load before capture
    await new Promise(r => setTimeout(r, 900));

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      width: 816,
      height: 1056,
      windowWidth: 816,
      windowHeight: 1056,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    pdf.addImage(imgData, "JPEG", 0, 0, 216, 279);
    pdf.save(fileName);
  } finally {
    document.body.removeChild(iframe);
  }
}
