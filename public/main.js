let asinResults = [];
let selectedColumns = [];

function csvSafe(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value)
    .replace(/"/g, '""')
    .replace(/\r?\n/g, " ")
    .replace(/\u2013|\u2014/g, "-")}"`;
}

document.addEventListener("DOMContentLoaded", () => {
  const totalAsinsDisplay = document.getElementById("totalAsins");
  const scanProgressDisplay = document.getElementById("scanProgress");
  const asinListTextarea = document.getElementById("asinList");
  const fileInput = document.getElementById("fileUpload");
  const resultTableBody = document.querySelector("#resultTable tbody");
  const resultTableHead = document.getElementById("tableHeadRow");
  const selectAllColumnsCheckbox = document.getElementById("selectAllColumns");

  // Column selection helpers
  const getColumnCheckboxes = () =>
    Array.from(document.querySelectorAll(".columnCheckbox"));

  const updateSelectAllState = () => {
    const checkboxes = getColumnCheckboxes();
    const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
    const noneChecked = checkboxes.every(cb => !cb.checked);
    selectAllColumnsCheckbox.checked = allChecked;
    selectAllColumnsCheckbox.indeterminate = !allChecked && !noneChecked;
  };

  selectAllColumnsCheckbox.addEventListener("change", () => {
    const checkboxes = getColumnCheckboxes();
    checkboxes.forEach(cb => {
      cb.checked = selectAllColumnsCheckbox.checked;
    });
  });

  getColumnCheckboxes().forEach(cb => {
    cb.addEventListener("change", () => {
      updateSelectAllState();
    });
  });

  fileInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const asins = ev.target.result
        .split(/\r?\n|,/)
        .map(a => a.trim())
        .filter(Boolean);

      asinListTextarea.value = asins.join("\n");
      totalAsinsDisplay.textContent = `Total ASINs: ${asins.length}`;
    };
    reader.readAsText(file);
  });

  asinListTextarea.addEventListener("input", () => {
    const asins = asinListTextarea.value
      .split(/\r?\n|,/)
      .map(a => a.trim())
      .filter(Boolean);
    totalAsinsDisplay.textContent = asins.length ? `Total ASINs: ${asins.length}` : "";
  });

  document.getElementById("checkBtn").addEventListener("click", async () => {
    let asinList = asinListTextarea.value
      .trim()
      .split(/\n|,/)
      .map(a => a.trim())
      .filter(Boolean);

    if (!asinList.length) {
      alert("Please enter ASINs");
      return;
    }

    if (asinList.length > 999) {
      asinList = asinList.slice(0, 999);
      alert("Max 999 ASINs allowed; extra ASINs were ignored.");
    }

    selectedColumns = Array.from(document.querySelectorAll(".columnCheckbox"))
      .filter(cb => cb.checked)
      .map(cb => {
        if (cb.value === "Seller") return "Sold By";
        return cb.value;
      });

    const headers = ["ASIN", ...selectedColumns];
    resultTableHead.innerHTML = "";
    headers.forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      resultTableHead.appendChild(th);
    });

    asinResults = [];
    resultTableBody.innerHTML = "";

    const totalASINs = asinList.length;
    let scannedCount = 0;
    scanProgressDisplay.textContent = `Scanning 0 of ${totalASINs}...`;

    // Client-side concurrency for real-time updates
    const concurrencyLimit = 8;
    let active = 0;
    let index = 0;

    const runNext = () => {
      while (active < concurrencyLimit && index < asinList.length) {
        const currentAsin = asinList[index++];
        active++;

        fetch("/api/scan-one", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ asin: currentAsin })
        })
          .then(res => {
            if (!res.ok) {
              return res.json().catch(() => ({}));
            }
            return res.json();
          })
          .then(msg => {
            if (!msg || !msg.asin) {
              return;
            }

        const dataMap = {
          ASIN: msg.asin,
          Title: msg.title || "",
          TitleLength: msg.titleLength || "",
          BulletPoints: msg.bulletPoints || "",
          "Sold By": msg.seller || "",
          BestSellerRank: msg.bestSellerRank || "",
          DeliveryDate: msg.deliveryDate || "",
          StarRating: msg.starRating || "",
          Reviews: msg.reviews || "",
          Coupon: msg.coupon || "",
          FBA: msg.fba || "",
          Deal: msg.deal || "",
          Price: msg.price || "",
          Aplus: msg.aplus || "",
          Category: msg.category || "",
          Images: msg.imagesCount || "",
          Video: msg.videoAvailable || ""
        };

        const row = { ASIN: msg.asin };
        selectedColumns.forEach(col => {
          row[col] = dataMap[col];
        });

        asinResults.push(row);

        const tr = document.createElement("tr");
        const asinCell = document.createElement("td");
        asinCell.textContent = msg.asin;
        tr.appendChild(asinCell);

        selectedColumns.forEach(col => {
          const td = document.createElement("td");
          td.textContent = row[col];
          tr.appendChild(td);
        });

        resultTableBody.appendChild(tr);

            scannedCount++;
            scanProgressDisplay.textContent =
              scannedCount < totalASINs
                ? `Scanning ${scannedCount} of ${totalASINs}...`
                : `✅ Scan complete for ${totalASINs} ASINs.`;
          })
          .catch(err => {
            console.error("Error scanning ASIN", currentAsin, err);
          })
          .finally(() => {
            active--;
            runNext();
          });
      }
    };

    runNext();
  });

  document.getElementById("downloadBtn").addEventListener("click", () => {
    if (!asinResults.length) {
      alert("No results to download yet.");
      return;
    }

    const cols = ["ASIN", ...selectedColumns];
    let csv = cols.join(",") + "\n";

    asinResults.forEach(r => {
      csv += cols.map(c => csvSafe(r[c])).join(",") + "\n";
    });

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "asin_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    fileInput.value = "";
    asinListTextarea.value = "";
    resultTableBody.innerHTML = "";
    resultTableHead.innerHTML = "";
    asinResults = [];
    selectedColumns = [];
    totalAsinsDisplay.textContent = "";
    scanProgressDisplay.textContent = "";
  });
});

