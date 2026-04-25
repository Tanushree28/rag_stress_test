"use strict";
const pptxgen = require("pptxgenjs");
const path = require("path");

const IMGS = path.resolve(__dirname, "symposium/public/results");
const img = (name) => path.join(IMGS, name);

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  darkBg:    "0D1B2A",
  midBg:     "1A3A5C",
  lightBg:   "F8F9FB",
  accent:    "00B4D8",
  accentDim: "0097B8",
  positive:  "10B981",
  negative:  "EF4444",
  textDark:  "1E293B",
  textLight: "FFFFFF",
  muted:     "64748B",
  cardBg:    "F1F5F9",
  cardBorder:"E2E8F0",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Teal left-side accent bar — used on every light content slide */
function accentBar(slide) {
  slide.addShape("rect", {
    x: 0, y: 0, w: 0.07, h: 5.625,
    fill: { color: C.accent },
    line: { color: C.accent },
  });
}

/** Slide title — consistent across all content slides */
function slideTitle(slide, text) {
  slide.addText(text, {
    x: 0.22, y: 0.3, w: 9.56, h: 0.55,
    fontFace: "Georgia", fontSize: 30, bold: true,
    color: C.textDark, valign: "middle", margin: 0,
  });
}

/** Thin separator line below the title */
function titleSep(slide) {
  slide.addShape("rect", {
    x: 0.22, y: 0.9, w: 9.56, h: 0.03,
    fill: { color: C.cardBorder },
    line: { color: C.cardBorder },
  });
}

/** Dark footer bar on dark slides */
function darkFooter(slide, text) {
  slide.addShape("rect", {
    x: 0, y: 5.25, w: 10, h: 0.375,
    fill: { color: C.midBg },
    line: { color: C.midBg },
  });
  slide.addText(text, {
    x: 0.3, y: 5.28, w: 9.4, h: 0.32,
    fontFace: "Calibri", fontSize: 10, color: C.accent,
    valign: "middle", margin: 0,
  });
}

/** Right-side callout panel (white card with accent top border) */
function calloutPanel(slide, lines) {
  // Card background
  slide.addShape("rect", {
    x: 6.55, y: 1.0, w: 3.15, h: 4.35,
    fill: { color: "FFFFFF" },
    line: { color: C.cardBorder, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.06, blur: 8, offset: 2, angle: 135 },
  });
  // Top accent strip
  slide.addShape("rect", {
    x: 6.55, y: 1.0, w: 3.15, h: 0.08,
    fill: { color: C.accent },
    line: { color: C.accent },
  });

  let y = 1.22;
  for (const item of lines) {
    if (item.type === "stat") {
      slide.addText(item.value, {
        x: 6.7, y, w: 2.85, h: 0.55,
        fontFace: "Georgia", fontSize: 22, bold: true, color: C.textDark,
        margin: 0,
      });
      y += 0.52;
      slide.addText(item.label, {
        x: 6.7, y, w: 2.85, h: 0.35,
        fontFace: "Calibri", fontSize: 10, color: C.muted, margin: 0,
      });
      y += 0.4;
      // thin rule
      slide.addShape("rect", {
        x: 6.7, y, w: 2.75, h: 0.02,
        fill: { color: C.cardBorder }, line: { color: C.cardBorder },
      });
      y += 0.15;
    } else if (item.type === "insight") {
      slide.addShape("rect", {
        x: 6.55, y: y - 0.05, w: 3.15, h: item.h || 0.9,
        fill: { color: "EFF9FC" }, line: { color: C.accent, width: 1 },
      });
      slide.addText(item.text, {
        x: 6.72, y, w: 2.8, h: item.h ? item.h - 0.15 : 0.75,
        fontFace: "Calibri", fontSize: 11, italic: true, color: C.textDark,
        wrap: true, margin: 0,
      });
      y += (item.h || 0.9) + 0.1;
    }
  }
}

// ─── Build Presentation ──────────────────────────────────────────────────────

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Stress-Testing Biomedical RAG";
pres.author = "Tanushree Nepal";

// ══════════════════════════════════════════════════════
// SLIDE 1 — Title
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.darkBg };

  // Large accent circle (decorative)
  s.addShape("ellipse", {
    x: 7.2, y: -1.2, w: 4.5, h: 4.5,
    fill: { color: C.accent, transparency: 88 },
    line: { color: C.accent, transparency: 88 },
  });
  s.addShape("ellipse", {
    x: -1.5, y: 3.2, w: 3.5, h: 3.5,
    fill: { color: C.accent, transparency: 92 },
    line: { color: C.accent, transparency: 92 },
  });

  // Eyebrow
  s.addText("THESIS SYMPOSIUM PRESENTATION", {
    x: 1.0, y: 1.1, w: 8, h: 0.4,
    fontFace: "Calibri", fontSize: 11, bold: true, color: C.accent,
    charSpacing: 4, align: "center", margin: 0,
  });

  // Title
  s.addText("Stress-Testing Biomedical RAG", {
    x: 0.8, y: 1.6, w: 8.4, h: 1.3,
    fontFace: "Georgia", fontSize: 44, bold: true,
    color: C.textLight, align: "center", valign: "middle", margin: 0,
  });

  // Subtitle
  s.addText("Quantifying Pipeline Robustness Under\nNoise, Conflict & Unanswerable Conditions", {
    x: 1.0, y: 3.0, w: 8, h: 0.9,
    fontFace: "Calibri", fontSize: 18, color: "9ECFDF",
    align: "center", valign: "top", margin: 0,
  });

  // Tech stack pills
  const pills = ["BioASQ Challenge 13b", "LLaMA 3.1:8b (Ollama)", "MedCPT Embeddings", "FAISS Index"];
  let px = 1.0;
  for (const label of pills) {
    const pw = 1.85;
    s.addShape("rect", {
      x: px, y: 4.1, w: pw, h: 0.34,
      fill: { color: C.midBg },
      line: { color: C.accent, width: 1 },
    });
    s.addText(label, {
      x: px, y: 4.12, w: pw, h: 0.3,
      fontFace: "Calibri", fontSize: 10, color: C.accent,
      align: "center", margin: 0,
    });
    px += pw + 0.2;
  }

  // Author
  s.addText("Tanushree Nepal", {
    x: 0.8, y: 4.68, w: 8.4, h: 0.3,
    fontFace: "Calibri", fontSize: 12, color: C.muted,
    align: "center", margin: 0,
  });
}

// ══════════════════════════════════════════════════════
// SLIDE 2 — The Problem
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addText("The Problem", {
    x: 1.0, y: 0.45, w: 8, h: 0.7,
    fontFace: "Georgia", fontSize: 38, bold: true,
    color: C.textLight, align: "center", margin: 0,
  });

  s.addText("RAG systems are increasingly deployed in clinical decision support and biomedical literature review.", {
    x: 1.2, y: 1.35, w: 7.6, h: 0.55,
    fontFace: "Calibri", fontSize: 15, color: "CBD5E1",
    align: "center", margin: 0,
  });

  s.addText("But real-world evidence is rarely clean.", {
    x: 1.2, y: 1.92, w: 7.6, h: 0.45,
    fontFace: "Georgia", fontSize: 18, bold: true, italic: true,
    color: C.accent, align: "center", margin: 0,
  });

  // 3 problem cards
  const cards = [
    { icon: "~", label: "Noise", desc: "Irrelevant and near-miss passages pollute the retrieved context" },
    { icon: "≠", label: "Conflict", desc: "Contradictory evidence misleads generation even when retrieval is correct" },
    { icon: "?", label: "Unanswerable", desc: "Answer-bearing passages may be missing entirely from the index" },
  ];
  let cx = 0.6;
  for (const card of cards) {
    s.addShape("rect", {
      x: cx, y: 2.55, w: 2.8, h: 2.3,
      fill: { color: C.midBg },
      line: { color: C.accent, width: 1 },
      shadow: { type: "outer", color: "000000", opacity: 0.2, blur: 10, offset: 3, angle: 135 },
    });
    s.addShape("rect", {
      x: cx, y: 2.55, w: 2.8, h: 0.07,
      fill: { color: C.accent }, line: { color: C.accent },
    });
    s.addText(card.icon, {
      x: cx, y: 2.68, w: 2.8, h: 0.6,
      fontFace: "Georgia", fontSize: 32, bold: true,
      color: C.accent, align: "center", margin: 0,
    });
    s.addText(card.label, {
      x: cx + 0.1, y: 3.3, w: 2.6, h: 0.4,
      fontFace: "Georgia", fontSize: 17, bold: true,
      color: C.textLight, align: "center", margin: 0,
    });
    s.addText(card.desc, {
      x: cx + 0.15, y: 3.72, w: 2.5, h: 0.85,
      fontFace: "Calibri", fontSize: 11, color: "94A3B8",
      align: "center", wrap: true, margin: 0,
    });
    cx += 3.1;
  }

  s.addText("How robust is a state-of-the-art biomedical RAG pipeline under these conditions?", {
    x: 1.0, y: 5.05, w: 8, h: 0.35,
    fontFace: "Calibri", fontSize: 12, bold: true, italic: true,
    color: C.muted, align: "center", margin: 0,
  });
}

// ══════════════════════════════════════════════════════
// SLIDE 3 — Experimental Design
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Experimental Design");
  titleSep(s);

  // 3 condition columns
  const cols = [
    {
      title: "Noise Injection",
      levels: "30% · 50% · 70%",
      desc: "Irrelevant passages + near-miss passages injected into retrieved context",
      color: "EFF9FC",
      border: C.accent,
    },
    {
      title: "Conflict Injection",
      levels: "50/50 · 70/30",
      desc: "LLaMA-negated gold snippets replace a fraction of the true evidence",
      color: "FFF7ED",
      border: "F59E0B",
    },
    {
      title: "Unanswerable",
      levels: "Partial · Full removal",
      desc: "Answer-bearing passages removed from context, testing pipeline abstention",
      color: "FEF2F2",
      border: C.negative,
    },
  ];

  let cx = 0.22;
  for (const col of cols) {
    const cw = 3.0;
    s.addShape("rect", {
      x: cx, y: 1.05, w: cw, h: 2.9,
      fill: { color: col.color },
      line: { color: col.border, width: 1.5 },
    });
    s.addShape("rect", {
      x: cx, y: 1.05, w: cw, h: 0.07,
      fill: { color: col.border }, line: { color: col.border },
    });
    s.addText(col.title, {
      x: cx + 0.12, y: 1.18, w: cw - 0.24, h: 0.45,
      fontFace: "Georgia", fontSize: 15, bold: true,
      color: C.textDark, margin: 0,
    });
    s.addText("Levels: " + col.levels, {
      x: cx + 0.12, y: 1.65, w: cw - 0.24, h: 0.32,
      fontFace: "Calibri", fontSize: 11, bold: true, color: col.border, margin: 0,
    });
    s.addText(col.desc, {
      x: cx + 0.12, y: 2.0, w: cw - 0.24, h: 0.85,
      fontFace: "Calibri", fontSize: 11, color: C.muted, wrap: true, margin: 0,
    });
    cx += cw + 0.29;
  }

  // Metrics row
  s.addText("METRICS TRACKED", {
    x: 0.22, y: 4.1, w: 9.56, h: 0.3,
    fontFace: "Calibri", fontSize: 10, bold: true, color: C.muted,
    charSpacing: 2, margin: 0,
  });

  const metrics = ["MAP@k", "MRR@k", "nDCG@k", "Citation Precision", "SCR (Groundedness)", "Task Score"];
  let mx = 0.22;
  for (const m of metrics) {
    const mw = 1.48;
    s.addShape("rect", {
      x: mx, y: 4.45, w: mw, h: 0.36,
      fill: { color: C.midBg },
      line: { color: C.midBg },
    });
    s.addText(m, {
      x: mx, y: 4.47, w: mw, h: 0.32,
      fontFace: "Calibri", fontSize: 10, color: C.textLight,
      align: "center", margin: 0,
    });
    mx += mw + 0.12;
  }

  s.addText("Question Types: Factoid · List · Yes/No · Summary  |  BioASQ-13b dataset", {
    x: 0.22, y: 5.0, w: 9.56, h: 0.3,
    fontFace: "Calibri", fontSize: 10, color: C.muted, margin: 0,
  });
}

// ══════════════════════════════════════════════════════
// SLIDE 4 — Noise Injection
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Noise Injection");
  titleSep(s);

  s.addText("How adding irrelevant/near-miss passages degrades retrieval and generation", {
    x: 0.22, y: 0.92, w: 6.1, h: 0.28,
    fontFace: "Calibri", fontSize: 11, italic: true, color: C.muted, margin: 0,
  });

  s.addImage({ path: img("noise-degarde.png"), x: 0.22, y: 1.05, w: 6.1, h: 4.3 });

  calloutPanel(s, [
    { type: "stat", value: "88% → 36%", label: "MAP@k at 70% noise" },
    { type: "stat", value: "~50%", label: "Citation Precision at 70% noise" },
    { type: "stat", value: "Stable", label: "Task Score (generation compensates)" },
    { type: "insight", h: 1.05, text: "Retrieval quality degrades monotonically with noise level. The generation layer partially compensates, but not enough to prevent task score decline." },
  ]);
}

// ══════════════════════════════════════════════════════
// SLIDE 5 — Conflict Injection
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Conflict Injection");
  titleSep(s);

  s.addText("How contradicted gold passages affect groundedness and answer quality", {
    x: 0.22, y: 0.92, w: 6.1, h: 0.28,
    fontFace: "Calibri", fontSize: 11, italic: true, color: C.muted, margin: 0,
  });

  s.addImage({ path: img("conflict-degrade.png"), x: 0.22, y: 1.05, w: 6.1, h: 4.3 });

  calloutPanel(s, [
    { type: "stat", value: "88.4%", label: "Retrieval — unchanged by conflict" },
    { type: "stat", value: "50.8% → 39.7%", label: "Task Score at 70/30 conflict" },
    { type: "stat", value: "16.8% → 12.8%", label: "SCR (Supported Claim Rate)" },
    { type: "insight", h: 1.05, text: "Conflict bypasses retrieval entirely. The pipeline retrieves correct gold passages but generates misleading answers — a generation-layer vulnerability." },
  ]);
}

// ══════════════════════════════════════════════════════
// SLIDE 6 — Unanswerable Queries
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Unanswerable Queries");
  titleSep(s);

  s.addText("Impact of removing answer-bearing passages from the pipeline", {
    x: 0.22, y: 0.92, w: 6.1, h: 0.28,
    fontFace: "Calibri", fontSize: 11, italic: true, color: C.muted, margin: 0,
  });

  s.addImage({ path: img("unanserable-degrade.png"), x: 0.22, y: 1.05, w: 6.1, h: 4.3 });

  calloutPanel(s, [
    { type: "stat", value: "88% → 1%", label: "Retrieval at Full removal" },
    { type: "stat", value: "50.8% → 18.4%", label: "Task Score at Full removal" },
    { type: "stat", value: "All → ~0%", label: "Every metric collapses at Full" },
    { type: "insight", h: 1.05, text: "The most catastrophic condition. The pipeline has no abstention mechanism — it confidently generates incorrect answers when evidence is absent." },
  ]);
}

// ══════════════════════════════════════════════════════
// SLIDE 7 — Impact Matrix (heatmap)
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Which Conditions Hurt Which Metrics?");
  titleSep(s);

  s.addImage({ path: img("heatmap.png"), x: 0.22, y: 1.0, w: 9.56, h: 3.85 });

  // Caption bar
  s.addShape("rect", {
    x: 0.22, y: 4.93, w: 9.56, h: 0.46,
    fill: { color: "EFF9FC" }, line: { color: C.accent, width: 1 },
  });
  s.addText(
    "Retrieval is uniquely destroyed by Unanswerable Full (1.0%).  " +
    "Groundedness is low even at baseline (16.8%) — a pipeline-level finding.  " +
    "Conflict spares retrieval but damages generation.",
    {
      x: 0.35, y: 4.96, w: 9.3, h: 0.4,
      fontFace: "Calibri", fontSize: 11, italic: true, color: C.textDark,
      margin: 0,
    }
  );
}

// ══════════════════════════════════════════════════════
// SLIDE 8 — Performance Degradation
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Performance Degradation from Clean Baseline");
  titleSep(s);

  s.addImage({ path: img("performance-degradation.png"), x: 0.22, y: 1.0, w: 9.56, h: 4.0 });

  // Legend callout strip
  const legend = [
    { color: C.positive, label: "Groundedness Delta" },
    { color: "4472C4", label: "Retrieval Delta" },
    { color: "E8943A", label: "Task Delta" },
  ];
  let lx = 1.8;
  for (const l of legend) {
    s.addShape("rect", {
      x: lx, y: 5.1, w: 0.22, h: 0.22,
      fill: { color: l.color }, line: { color: l.color },
    });
    s.addText(l.label, {
      x: lx + 0.28, y: 5.1, w: 2.0, h: 0.22,
      fontFace: "Calibri", fontSize: 11, color: C.muted, margin: 0,
    });
    lx += 2.6;
  }
}

// ══════════════════════════════════════════════════════
// SLIDE 9 — Question Type Resilience
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.lightBg };
  accentBar(s);
  slideTitle(s, "Not All Questions Are Equal");
  titleSep(s);

  s.addText("Task Score by Question Type × Condition — which types are most affected by each perturbation?", {
    x: 0.22, y: 0.92, w: 9.56, h: 0.28,
    fontFace: "Calibri", fontSize: 11, italic: true, color: C.muted, margin: 0,
  });

  s.addImage({ path: img("overall-degrade.png"), x: 0.22, y: 1.1, w: 9.56, h: 3.75 });

  // Finding strip
  s.addShape("rect", {
    x: 0.22, y: 4.93, w: 9.56, h: 0.46,
    fill: { color: "EFF9FC" }, line: { color: C.accent, width: 1 },
  });
  s.addText(
    "Summary questions are most resilient across all perturbation types.  " +
    "Yes/No questions show the highest variance.  " +
    "All types collapse under Unanswerable Full.",
    {
      x: 0.35, y: 4.96, w: 9.3, h: 0.4,
      fontFace: "Calibri", fontSize: 11, italic: true, color: C.textDark, margin: 0,
    }
  );
}

// ══════════════════════════════════════════════════════
// SLIDE 10 — Key Numbers (dark)
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addText("By the Numbers", {
    x: 0.8, y: 0.3, w: 8.4, h: 0.65,
    fontFace: "Georgia", fontSize: 38, bold: true,
    color: C.textLight, align: "center", margin: 0,
  });
  s.addText("The pipeline is fragile in predictable, interpretable ways", {
    x: 1.0, y: 1.0, w: 8, h: 0.35,
    fontFace: "Calibri", fontSize: 14, italic: true, color: C.muted,
    align: "center", margin: 0,
  });

  const stats = [
    { value: "88% → 1%",  sublabel: "Retrieval collapse",    note: "Unanswerable Full",   color: C.negative },
    { value: "−40 pp",    sublabel: "MAP@k drop",             note: "At 70% noise",        color: "E8943A"   },
    { value: "Immune",    sublabel: "Retrieval under conflict",note: "Citation P: ~75%",    color: C.positive },
    { value: "Summary",   sublabel: "Most resilient type",     note: "Across all conditions",color: C.accent  },
  ];

  let sx = 0.35;
  for (const st of stats) {
    const sw = 2.15;
    s.addShape("rect", {
      x: sx, y: 1.5, w: sw, h: 3.2,
      fill: { color: C.midBg },
      line: { color: st.color, width: 1.5 },
      shadow: { type: "outer", color: "000000", opacity: 0.25, blur: 12, offset: 3, angle: 135 },
    });
    s.addShape("rect", {
      x: sx, y: 1.5, w: sw, h: 0.08,
      fill: { color: st.color }, line: { color: st.color },
    });
    s.addText(st.value, {
      x: sx + 0.1, y: 1.75, w: sw - 0.2, h: 1.05,
      fontFace: "Georgia", fontSize: 30, bold: true,
      color: st.color, align: "center", valign: "middle", margin: 0,
    });
    s.addText(st.sublabel, {
      x: sx + 0.1, y: 2.85, w: sw - 0.2, h: 0.45,
      fontFace: "Calibri", fontSize: 12, bold: true,
      color: C.textLight, align: "center", margin: 0,
    });
    s.addText(st.note, {
      x: sx + 0.1, y: 3.32, w: sw - 0.2, h: 0.32,
      fontFace: "Calibri", fontSize: 10, color: C.muted,
      align: "center", margin: 0,
    });
    sx += sw + 0.3;
  }
}

// ══════════════════════════════════════════════════════
// SLIDE 11 — Conclusions
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addText("Conclusions", {
    x: 0.8, y: 0.3, w: 8.4, h: 0.65,
    fontFace: "Georgia", fontSize: 38, bold: true,
    color: C.textLight, align: "center", margin: 0,
  });

  const findings = [
    { n: "01", text: "Noise is a retrieval-layer problem. MAP@k degrades monotonically; the generation layer cannot compensate at high noise levels." },
    { n: "02", text: "Conflict is a generation-layer problem. Retrieval stays intact, but the model hallucinates when contradictory evidence is present." },
    { n: "03", text: "Unanswerable conditions are catastrophic. The pipeline has no abstention capability — all metrics collapse to near zero." },
    { n: "04", text: "Groundedness is low even at baseline (16.8% SCR). This is a fundamental limitation of the current prompting strategy." },
  ];

  let fy = 1.1;
  for (const f of findings) {
    s.addShape("rect", {
      x: 0.5, y: fy, w: 0.55, h: 0.62,
      fill: { color: C.accent }, line: { color: C.accent },
    });
    s.addText(f.n, {
      x: 0.5, y: fy, w: 0.55, h: 0.62,
      fontFace: "Georgia", fontSize: 18, bold: true,
      color: C.darkBg, align: "center", valign: "middle", margin: 0,
    });
    s.addText(f.text, {
      x: 1.18, y: fy + 0.05, w: 8.3, h: 0.52,
      fontFace: "Calibri", fontSize: 13, color: "CBD5E1", wrap: true, margin: 0,
    });
    fy += 0.78;
  }

  // Future work
  s.addShape("rect", {
    x: 0.5, y: 4.35, w: 9.0, h: 0.96,
    fill: { color: C.midBg }, line: { color: C.accent, width: 1 },
  });
  s.addText("Future Work", {
    x: 0.7, y: 4.42, w: 2.0, h: 0.3,
    fontFace: "Calibri", fontSize: 11, bold: true, color: C.accent, margin: 0,
  });
  s.addText(
    "Cross-encoder recalibration for conflict-aware retrieval  ·  Abstention mechanisms for unanswerable conditions  ·  Larger N across all question types  ·  Extensible to any domain-specific RAG evaluation",
    {
      x: 0.7, y: 4.75, w: 8.6, h: 0.46,
      fontFace: "Calibri", fontSize: 11, color: "94A3B8", wrap: true, margin: 0,
    }
  );
}

// ══════════════════════════════════════════════════════
// SLIDE 12 — Thank You
// ══════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.darkBg };

  s.addShape("ellipse", {
    x: 3.5, y: 0.8, w: 3.0, h: 3.0,
    fill: { color: C.accent, transparency: 90 },
    line: { color: C.accent, transparency: 90 },
  });

  s.addText("Thank You", {
    x: 0.8, y: 1.4, w: 8.4, h: 1.1,
    fontFace: "Georgia", fontSize: 56, bold: true,
    color: C.textLight, align: "center", margin: 0,
  });

  s.addText("Questions?", {
    x: 1.0, y: 2.65, w: 8, h: 0.55,
    fontFace: "Calibri", fontSize: 22, italic: true, color: C.accent,
    align: "center", margin: 0,
  });

  s.addText("Tanushree Nepal", {
    x: 1.0, y: 3.55, w: 8, h: 0.35,
    fontFace: "Calibri", fontSize: 14, bold: true, color: C.textLight,
    align: "center", margin: 0,
  });

  s.addText("Biomedical RAG Stress-Test  ·  BioASQ Challenge 13b  ·  Local LLaMA 3.1:8b", {
    x: 1.0, y: 3.95, w: 8, h: 0.3,
    fontFace: "Calibri", fontSize: 11, color: C.muted,
    align: "center", margin: 0,
  });
}

// ─── Write File ───────────────────────────────────────────────────────────────
const OUT = path.resolve(__dirname, "symposium_presentation.pptx");
pres.writeFile({ fileName: OUT }).then(() => {
  console.log("Written:", OUT);
});
