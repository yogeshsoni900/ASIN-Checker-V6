const express = require("express");
const cors = require("cors");
const { JSDOM } = require("jsdom");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

async function processAsin(asin) {
  if (!asin) {
    return {
      asin,
      title: "Invalid ASIN",
      coupon: "Error",
      fba: "Error",
      seller: "Error",
      deal: "Error",
      price: "Error",
      shipmentChannel: "Error",
      aplus: "Error",
      deliveryDate: "Error",
      bestSellerRank: "Error",
      category: "Error",
      starRating: "Error",
      reviews: "Error",
      bulletPoints: "Not Available",
      imagesCount: "Not Available"
    };
  }

  const url = `https://www.amazon.in/dp/${asin}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const canonical = doc.querySelector("link[rel='canonical']");
    const actualURL = canonical ? canonical.getAttribute("href") : "";
    const redirectedASINMatch = actualURL.match(/\/dp\/([A-Z0-9]{10})/);
    const canonicalASIN = redirectedASINMatch ? redirectedASINMatch[1] : asin;

    // ✅ Variation bundle / inactive child handling:
    // If Amazon redirects this ASIN to a different canonical ASIN,
    // treat the requested ASIN as an inactive child and return that state.
    if (canonicalASIN !== asin) {
      const inactiveValue = "Inactive Child";
      return {
        asin, // keep the originally requested ASIN
        title: inactiveValue,
        titleLength: inactiveValue,
        coupon: inactiveValue,
        fba: inactiveValue,
        seller: inactiveValue,
        deal: inactiveValue,
        price: inactiveValue,
        shipmentChannel: inactiveValue,
        aplus: inactiveValue,
        deliveryDate: inactiveValue,
        bestSellerRank: inactiveValue,
        category: inactiveValue,
        starRating: inactiveValue,
        reviews: inactiveValue,
        bulletPoints: inactiveValue,
        imagesCount: inactiveValue,
        videoAvailable: inactiveValue
      };
    }

    const titleEl = doc.getElementById("productTitle");
    const productTitle = titleEl ? titleEl.textContent.trim() : "Not Available";
    const titleLength = productTitle !== "Not Available" ? productTitle.length : 0;

    const sellerEl = doc.querySelector("#sellerProfileTriggerId");
    const seller = sellerEl ? sellerEl.textContent.trim() : "Not Available";

    let hasAplus = "Not Available";
    let deliveryDate = "Not Available";
    let bestSellerRank = "Not Available";

    try {
      const possibleSelectors = [];
      possibleSelectors.push(
        ...Array.from(doc.querySelectorAll("#productDetails_detailBullets_sections1 tr")).filter(row =>
          row.textContent.includes("Best Sellers Rank")
        )
      );
      possibleSelectors.push(
        ...Array.from(doc.querySelectorAll("#detailBulletsWrapper_feature_div li")).filter(li =>
          li.textContent.includes("Best Sellers Rank")
        )
      );
      possibleSelectors.push(
        ...Array.from(doc.querySelectorAll("#prodDetails tr, #productDetails_db_sections tr")).filter(row =>
          row.textContent.includes("Best Sellers Rank")
        )
      );
      if (possibleSelectors.length === 0) {
        possibleSelectors.push(
          ...Array.from(doc.querySelectorAll("span, div, li")).filter(el =>
            el.textContent.includes("Best Sellers Rank")
          )
        );
      }

      if (possibleSelectors.length > 0) {
        bestSellerRank = possibleSelectors[0].textContent.replace(/\s+/g, " ").trim();
      }
    } catch (e) {
      console.warn("Error extracting Best Seller Rank:", e);
    }

    const lower = html.toLowerCase();
    const hasCoupon =
      lower.includes("coupon applied") ||
      lower.includes("extra \u20b9") ||
      /\u20b9\d+\s*off/i.test(lower) ||
      /apply \u20b9\d+/i.test(lower) ||
      /save.*\u20b9\d+/i.test(lower);
    const coupon = hasCoupon ? "Yes" : "No";

    let starRating = "Not Available";
    try {
      const ratingEl = doc.querySelector(
        "span[data-asin] i span.a-size-base.a-color-base, #acrPopover span.a-size-base.a-color-base"
      );
      if (ratingEl && /^\d+(\.\d+)?$/.test(ratingEl.textContent.trim())) {
        starRating = ratingEl.textContent.trim();
      } else {
        const altEl = doc.querySelector("#acrPopover .a-icon-alt");
        if (altEl) {
          const match = altEl.textContent.trim().match(/^\d+(\.\d+)?/);
          if (match) starRating = match[0];
        }
      }
    } catch (e) {
      console.warn("Star rating extraction failed:", e);
    }

    let reviews = "Not Available";
    try {
      const reviewsEl = doc.querySelector("#acrCustomerReviewText");
      if (reviewsEl) {
        const ariaLabel = reviewsEl.getAttribute("aria-label") || "";
        const match = ariaLabel.match(/\d[\d,]*/);
        reviews = match ? match[0] : reviewsEl.textContent.trim();
      }
    } catch (e) {
      console.warn("Review count extraction failed:", e);
    }

    hasAplus = doc.querySelector(".aplus-module-wrapper.aplus-3p-fixed-width") ? "Yes" : "No";

    try {
      const deliverySelectors = [
        "#delivery-message b",
        "#delivery-message span",
        "#mir-layout-DELIVERY_BLOCK .a-text-bold",
        "#ddmDeliveryMessage span",
        "#deliveryMessageMir span"
      ];

      for (const selector of deliverySelectors) {
        const el = doc.querySelector(selector);
        if (!el) continue;

        const text = el.textContent.trim();
        const junkPattern = /cashback|rating|emi|icici|bank|star|review|save|off|\u20b9/i;
        if (junkPattern.test(text)) continue;

        const datePattern =
          /\b(\d{1,2}\s*-\s*\d{1,2}\s+[A-Za-z]+|\d{1,2}\s+[A-Za-z]+|[A-Za-z]+day,\s*\d{1,2}\s+[A-Za-z]+|[A-Za-z]+\s+\d{1,2})\b/;
        const match = text.match(datePattern);

        if (match) {
          deliveryDate = match[0].trim();
          break;
        }
      }
    } catch (e) {
      console.warn("Delivery date extraction failed:", e);
    }

    const priceWhole = doc.querySelector(".a-price-whole");
    const priceFraction = doc.querySelector(".a-price-fraction");
    let price = "Not Available";
    if (priceWhole) {
      const wholeValue = priceWhole.childNodes[0]?.textContent?.trim() || priceWhole.textContent.trim();
      const fractionValue = priceFraction ? priceFraction.textContent.trim() : "00";
      price = `${wholeValue}.${fractionValue}`;
    }

    const isFBA = !!doc.querySelector(".a-icon-text-fba");
    const dealEl = doc.querySelector("#dealBadgeSupportingText span");
    let deal = dealEl ? dealEl.textContent.trim() : "No Deal";

    let shipmentChannel = "Not Available";
    const shipEl = doc.querySelector("span.a-size-small.offer-display-feature-text-message");
    if (shipEl) shipmentChannel = shipEl.textContent.trim() === "Amazon" ? "No" : "Yes";

    let category = "Not Available";
    try {
      const breadcrumbLinks = doc.querySelectorAll("#wayfinding-breadcrumbs_feature_div ul.a-unordered-list a");
      if (breadcrumbLinks.length > 0)
        category = breadcrumbLinks[0].textContent.trim().replace(/\u00a0/g, " ");
      else {
        const fallbackBreadcrumb = doc.querySelectorAll(
          "#wayfinding-breadcrumbs_container ul.a-unordered-list a"
        );
        if (fallbackBreadcrumb.length > 0)
          category = fallbackBreadcrumb[0].textContent.trim().replace(/\u00a0/g, " ");
      }
    } catch (e) {
      console.warn("Main Category extraction failed:", e);
    }

    if (seller === "Not Available") {
      deal = "Not Available";
      price = "Not Available";
      deliveryDate = "Not Available";
    }

    let bulletPointsCount = "Not Available";
    try {
      const bulletUL = doc.querySelector(
        "ul.a-unordered-list.a-vertical.a-spacing-mini, ul.a-unordered-list.a-vertical.a-spacing-small"
      );
      if (bulletUL) {
        const bullets = bulletUL.querySelectorAll("li");
        bulletPointsCount = bullets.length > 0 ? bullets.length : "Not Available";
      }
    } catch (e) {
      bulletPointsCount = "Not Available";
    }

    // ✅ Product images count (only images, no videos)
    // - If up to 5 images: return exact number as string ("1"–"5")
    // - If more than 5 images: return "5+"
    let imagesCount = "Not Available";
    try {
      const imageSrcs = new Set();

      // Look at the thumbnail strip; ignore any entries that are clearly video or gallery openers
      doc
        .querySelectorAll("#altImages img, #imageBlockThumbs img, .thumbnail img")
        .forEach(img => {
          const src = (img.getAttribute("src") || img.getAttribute("data-src") || "").trim();
          const alt = (img.getAttribute("alt") || "").toLowerCase();
          const parent = img.closest("[data-image-index], [data-video-index]");
          const dataVideoIndex = parent?.getAttribute("data-video-index");
          const dataVariant = (parent?.getAttribute("data-variant") || "").toLowerCase();

          if (!src) return;

          // Exclude sprites / spacers
          if (/sprite|transparent|blank/.test(src)) return;

          // Exclude any obvious video tiles
          if (dataVideoIndex != null || dataVariant.includes("video") || alt.includes("video")) return;

          // Exclude gallery opener / "see more" style tiles
          if (
            alt.includes("view gallery") ||
            alt.includes("open gallery") ||
            alt.includes("see more") ||
            alt.includes("see all")
          ) {
            return;
          }

          imageSrcs.add(src);
        });

      const count = imageSrcs.size;
      if (count > 0) {
        imagesCount = count > 5 ? "5+" : String(count);
      }
    } catch {
      imagesCount = "Not Available";
    }

    // ✅ Product video presence (Yes/No)
    let videoAvailable = "No";
    try {
      // Look for video player containers or video thumbnails within the media strip
      const hasVideoElement =
        doc.querySelector("#videoPlayer, #dp-video-player, .video-block, .aplus-video-player") ||
        doc.querySelector("[data-video-url], [data-video-id]") ||
        Array.from(doc.querySelectorAll("#altImages img, #imageBlockThumbs img, .thumbnail img")).some(
          img => {
            const alt = (img.getAttribute("alt") || "").toLowerCase();
            const src = (img.getAttribute("src") || img.getAttribute("data-src") || "").toLowerCase();
            return alt.includes("video") || src.includes("video");
          }
        );

      if (hasVideoElement) {
        videoAvailable = "Yes";
      }
    } catch (e) {
      videoAvailable = "No";
    }

    return {
      asin: canonicalASIN,
      title: productTitle,
      titleLength,
      coupon,
      fba: isFBA ? "Yes" : "No",
      seller,
      deal,
      price,
      shipmentChannel,
      aplus: hasAplus,
      deliveryDate,
      bestSellerRank,
      category,
      starRating,
      reviews,
      bulletPoints: bulletPointsCount,
      imagesCount,
      videoAvailable
    };
  } catch (error) {
    console.error("ASIN fetch error:", error);
    return {
      asin,
      title: "Error",
      coupon: "Error",
      fba: "Error",
      seller: "Error",
      deal: "Error",
      price: "Error",
      shipmentChannel: "Error",
      aplus: "Error",
      deliveryDate: "Error",
      bestSellerRank: "Error",
      category: "Error",
      starRating: "Error",
      reviews: "Error",
      bulletPoints: "Not Available",
      imagesCount: "Not Available",
      videoAvailable: "No"
    };
  }
}

async function runWithConcurrency(items, worker, limit = 5) {
  const results = [];
  let index = 0;

  return new Promise(resolve => {
    let active = 0;

    const next = () => {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < limit && index < items.length) {
        const currentIndex = index++;
        active++;
        worker(items[currentIndex])
          .then(result => {
            results[currentIndex] = result;
          })
          .catch(() => {
            results[currentIndex] = null;
          })
          .finally(() => {
            active--;
            next();
          });
      }
    };

    next();
  });
}

// Batch scan endpoint (kept for compatibility; not used by UI now)
app.post("/api/scan", async (req, res) => {
  const { asins } = req.body || {};

  if (!Array.isArray(asins) || asins.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty 'asins' array" });
  }

  const uniqueAsins = Array.from(
    new Set(
      asins
        .map(a => (a || "").toString().trim())
        .filter(Boolean)
    )
  );

  const limitedAsins = uniqueAsins.slice(0, 999);

  const results = await runWithConcurrency(limitedAsins, processAsin, 8);

  res.json({
    count: results.length,
    results
  });
});

// Single-ASIN endpoint for real-time UI updates
app.post("/api/scan-one", async (req, res) => {
  const { asin } = req.body || {};

  if (!asin || typeof asin !== "string") {
    return res.status(400).json({ error: "Provide a valid 'asin' string" });
  }

  const trimmed = asin.trim();
  if (!trimmed) {
    return res.status(400).json({ error: "ASIN cannot be empty" });
  }

  const result = await processAsin(trimmed);
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Amazon ASIN Checker web server running on http://localhost:${PORT}`);
});

