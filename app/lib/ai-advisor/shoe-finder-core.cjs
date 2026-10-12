/* Shared Shoe Finder engine — extracted verbatim from approved shoe-finder.js.
 * Keep scoring, bucketing and tie-breaks unchanged. */
(function (global) {
  "use strict";
    function normalizeProduct(product) {
      return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        url: product.url,
        image: product.image || "",
        price: Number(product.price || 0),
        compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
        support: normalizeSupportList(product.support),
        usage: normalizeUsageList(product.usage),
        weight_range: normalizeWeightList(product.weight_range),
        distance_range: normalizeDistanceList(product.distance_range),
        priority: Number(product.priority || 0),
        excluded: parseBoolean(product.excluded),
        sizes_available: Array.from(
          new Set(
            normalizeMultiValue(product.sizes_available)
              .map(normalizeSize)
              .filter(Boolean)
          )
        )
      };
    }

    function parseBoolean(value) {
      if (value === true || value === false) return value;
      const s = String(value || "").trim().toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }

    function normalizeMultiValue(value) {
      if (value == null || value === "") return [];
      if (Array.isArray(value)) return value.flatMap((item) => normalizeMultiValue(item));
      return String(value)
        .split(/[\n,;|]/g)
        .map((v) => String(v).trim())
        .filter(Boolean);
    }

    function normalizeSize(value) {
      return String(value || "")
        .replace(",", ".")
        .replace(/\s*EU$/i, "")
        .replace(/\s*eur$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function parseSizeNumber(value) {
      const normalized = normalizeSize(value);
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function getSizeCompatibility(productSizes, selectedSize) {
      const selected = parseSizeNumber(selectedSize);
      if (selected == null) {
        return {
          isCompatible: true,
          isExact: false,
          hasHalfTolerance: false,
          minDiff: 0
        };
      }

      let minDiff = Infinity;

      for (const size of productSizes || []) {
        const parsed = parseSizeNumber(size);
        if (parsed == null) continue;
        const diff = Math.abs(parsed - selected);
        if (diff < minDiff) minDiff = diff;
      }

      if (!Number.isFinite(minDiff)) {
        return {
          isCompatible: false,
          isExact: false,
          hasHalfTolerance: false,
          minDiff: Infinity
        };
      }

      return {
        isCompatible: minDiff <= 0.5,
        isExact: minDiff === 0,
        hasHalfTolerance: minDiff > 0 && minDiff <= 0.5,
        minDiff
      };
    }

    function normalizeSupport(value) {
      const s = String(value || "").trim().toLowerCase();
      if (!s) return "";
      if (["neutral", "neutro", "neutra"].includes(s)) return "neutral";
      if (["stability", "support", "supporto", "pronation", "pronatore", "pronazione"].includes(s)) return "stability";
      if (["supination", "supinator", "supinazione", "supinatore"].includes(s)) return "supination";
      if (["unknown", "non lo so"].includes(s)) return "unknown";
      return s;
    }

    function normalizeSupportList(value) {
      return Array.from(new Set(normalizeMultiValue(value).map(normalizeSupport).filter(Boolean)));
    }

    function normalizeUsage(value) {
      const s = String(value || "").trim().toLowerCase();
      if (!s) return "";
      if (["daily", "easy", "easy run", "allenamento", "allenamenti quotidiani", "training", "daily trainer"].includes(s)) return "daily";
      if (["long-distance", "long distance", "long run", "corse lunghe", "lunghe distanze"].includes(s)) return "long-distance";
      if (["speed", "velocità", "ripetute", "tempo", "fast"].includes(s)) return "speed";
      if (["race", "gara", "racing"].includes(s)) return "race";
      if (["trail", "trail running"].includes(s)) return "trail";
      return s;
    }

    function normalizeUsageList(value) {
      return Array.from(new Set(normalizeMultiValue(value).map(normalizeUsage).filter(Boolean)));
    }

    function normalizeWeight(value) {
      const s = String(value || "").trim().toLowerCase();
      if (!s) return "";
      if (["under-60", "<60", "meno di 60", "meno di 60 kg"].includes(s)) return "under-60";
      if (["60-75", "60 – 75", "60–75"].includes(s)) return "60-75";
      if (["76-90", "76 – 90", "76–90"].includes(s)) return "76-90";
      if (["over-90", ">90", "oltre 90", "oltre 90 kg"].includes(s)) return "over-90";
      return s;
    }

    function normalizeWeightList(value) {
      return Array.from(new Set(normalizeMultiValue(value).map(normalizeWeight).filter(Boolean)));
    }

    function normalizeDistance(value) {
      const s = String(value || "").trim().toLowerCase();
      if (!s) return "";
      if (["0-5", "0 – 5", "0–5", "fino a 5"].includes(s)) return "0-5";
      if (["5-10", "5 – 10", "5–10"].includes(s)) return "5-10";
      if (["10-20", "10 – 20", "10–20"].includes(s)) return "10-20";
      if (["20-plus", "20+", "oltre 20"].includes(s)) return "20-plus";
      return s;
    }

    function normalizeDistanceList(value) {
      return Array.from(new Set(normalizeMultiValue(value).map(normalizeDistance).filter(Boolean)));
    }

    function scoreUsage(product, answer) {
      if (!answer) return 0;
      if (product.usage.includes(answer)) return 35;

      const affinityMap = {
        daily: ["long-distance"],
        "long-distance": ["daily"],
        speed: ["race"],
        race: ["speed"]
      };

      return affinityMap[answer]?.some((val) => product.usage.includes(val)) ? 15 : 0;
    }

    function scoreDistance(product, answer) {
      if (!answer) return 0;
      if (product.distance_range.includes(answer)) return 18;

      const adjacencyMap = {
        "0-5": ["5-10"],
        "5-10": ["0-5", "10-20"],
        "10-20": ["5-10", "20-plus"],
        "20-plus": ["10-20"]
      };

      return adjacencyMap[answer]?.some((val) => product.distance_range.includes(val)) ? 8 : 0;
    }

    function scoreWeight(product, answer) {
      if (!answer) return 0;
      if (product.weight_range.includes(answer)) return 12;

      const adjacencyMap = {
        "under-60": ["60-75"],
        "60-75": ["under-60", "76-90"],
        "76-90": ["60-75", "over-90"],
        "over-90": ["76-90"]
      };

      return adjacencyMap[answer]?.some((val) => product.weight_range.includes(val)) ? 5 : 0;
    }

    function scoreWithinBucket(product, answers) {
      const usageScore = scoreUsage(product, answers.usage);
      const distanceScore = scoreDistance(product, answers.distance);
      const weightScore = scoreWeight(product, answers.weight);
      const priorityScore = Math.min(Number(product.priority || 0), 10);
      const sizeBonus = product.size_match?.isExact ? 8 : product.size_match?.hasHalfTolerance ? 3 : 0;

      return {
        total: usageScore + distanceScore + weightScore + priorityScore + sizeBonus,
        usage: usageScore,
        distance: distanceScore,
        weight: weightScore,
        priority: priorityScore,
        sizeBonus
      };
    }

    function getSupportBucket(product, answer) {
      if (!answer || answer === "unknown") {
        if (product.support.includes("neutral")) return "primary";
        if (product.support.includes("stability")) return "secondary";
        if (product.support.includes("supination")) return "secondary";
        return "fallback";
      }

      if (answer === "neutral") {
        if (product.support.includes("neutral")) return "primary";
        if (product.support.includes("supination")) return "secondary";
        if (product.support.includes("stability")) return "fallback";
        return "fallback";
      }

      if (answer === "stability") {
        if (product.support.includes("stability")) return "primary";
        if (product.support.includes("neutral")) return "secondary";
        if (product.support.includes("supination")) return "fallback";
        return "fallback";
      }

      if (answer === "supination") {
        if (product.support.includes("supination")) return "primary";
        if (product.support.includes("neutral")) return "secondary";
        if (product.support.includes("stability")) return "fallback";
        return "fallback";
      }

      if (product.support.includes(answer)) return "primary";
      return "fallback";
    }

    function buildLabels(product, answers) {
      const labels = [];

      if (answers.support === "supination") {
        if (product.support.includes("supination")) {
          labels.push("Compatibile con il tuo appoggio");
        } else if (product.support.includes("neutral")) {
          labels.push("Valida anche per tendenza alla supinazione");
        }
      } else if (answers.support === "stability") {
        if (product.support.includes("stability")) {
          labels.push("Compatibile con il tuo appoggio");
        } else if (product.support.includes("neutral")) {
          labels.push("Alternativa con appoggio neutro");
        }
      } else if (answers.support === "neutral") {
        if (product.support.includes("neutral")) {
          labels.push("Compatibile con il tuo appoggio");
        } else if (product.support.includes("supination")) {
          labels.push("Alternativa vicina al tuo profilo");
        }
      } else if (answers.support === "unknown" && product.support.includes("neutral")) {
        labels.push("Profilo versatile e facile da gestire");
      }

      if (product.size_match?.isExact) {
        labels.push("Disponibile nel tuo numero");
      } else if (product.size_match?.hasHalfTolerance) {
        labels.push("Disponibile nel mezzo numero più vicino");
      }

      if (answers.usage && product.usage.includes(answers.usage)) {
        if (answers.usage === "daily") labels.push("Ottima per allenamenti quotidiani");
        if (answers.usage === "long-distance") labels.push("Indicata per corse lunghe");
        if (answers.usage === "speed") labels.push("Adatta a ritmi veloci");
        if (answers.usage === "race") labels.push("Pensata per performance e gara");
        if (answers.usage === "trail") labels.push("Ideale per trail");
      }

      if (answers.weight && product.weight_range.includes(answers.weight)) {
        labels.push("Consigliata per la tua fascia di peso");
      }

      return labels.slice(0, 2);
    }

    function sortWithinBucket(a, b) {
      const aExact = a?.size_match?.isExact ? 1 : 0;
      const bExact = b?.size_match?.isExact ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;

      const aHalf = a?.size_match?.hasHalfTolerance ? 1 : 0;
      const bHalf = b?.size_match?.hasHalfTolerance ? 1 : 0;
      if (aHalf !== bHalf) return aHalf - bHalf;

      if ((b.bucket_score?.total || 0) !== (a.bucket_score?.total || 0)) {
        return (b.bucket_score?.total || 0) - (a.bucket_score?.total || 0);
      }

      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);

      return (a.price || 0) - (b.price || 0);
    }

    function rankProducts(products, answers) {
      const primaryBucket = [];
      const secondaryBucket = [];
      const fallbackBucket = [];

      for (const product of products) {
        if (product.excluded) continue;

        const sizeMatch = getSizeCompatibility(product.sizes_available, answers.size);
        if (!sizeMatch.isCompatible) continue;

        const enriched = {
          ...product,
          size_match: sizeMatch
        };

        enriched.bucket = getSupportBucket(enriched, answers.support);
        enriched.bucket_score = scoreWithinBucket(enriched, answers);
        enriched.score = enriched.bucket_score.total;
        enriched.labels = buildLabels(enriched, answers);

        if (enriched.bucket === "primary") primaryBucket.push(enriched);
        else if (enriched.bucket === "secondary") secondaryBucket.push(enriched);
        else fallbackBucket.push(enriched);
      }

      primaryBucket.sort(sortWithinBucket);
      secondaryBucket.sort(sortWithinBucket);
      fallbackBucket.sort(sortWithinBucket);

      const all = [...primaryBucket, ...secondaryBucket, ...fallbackBucket];

      const baseVisibleCount = 4;
      const visibleCount = primaryBucket.length > baseVisibleCount
        ? primaryBucket.length
        : baseVisibleCount;

      const primary = all.slice(0, visibleCount);
      const secondary = all.slice(visibleCount);

      return {
        all,
        primary,
        secondary,
        buckets: {
          primary: primaryBucket,
          secondary: secondaryBucket,
          fallback: fallbackBucket
        }
      };
    }


  global.ValsportShoeFinderCore = Object.freeze({
    normalizeProduct,
    parseBoolean,
    normalizeMultiValue,
    normalizeSize,
    parseSizeNumber,
    getSizeCompatibility,
    normalizeSupport,
    normalizeSupportList,
    normalizeUsage,
    normalizeUsageList,
    normalizeWeight,
    normalizeWeightList,
    normalizeDistance,
    normalizeDistanceList,
    scoreUsage,
    scoreDistance,
    scoreWeight,
    scoreWithinBucket,
    getSupportBucket,
    buildLabels,
    sortWithinBucket,
    rankProducts
  });
})(typeof window !== "undefined" ? window : globalThis);
