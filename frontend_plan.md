# 🖥️ Frontend Plan: Biomedical RAG Stress-Test Dashboard

## 1. Main Goal

Build a **ChatGPT-like thesis demo app** where a user can:

- Ask a biomedical question
- Choose experiment settings from dropdowns
- Run baseline or stressed retrieval
- See answer + citations
- Inspect evidence
- Compare metrics visually

The frontend should feel like a **research product demo**, not just a class project UI.

---

## 2. Best Stack

Use:

- Next.js
- React
- Tailwind CSS
- shadcn/ui
- Recharts (for charts)

### Benefits:

- Modern look
- Reusable UI components
- Easy dropdowns, tabs, cards, sliders
- Responsive layout
- Polished demo quality

---

## 3. Core UI Layout

### Page Structure

Use a **3-panel layout**:

---

### Left Panel — Experiment Controls

Where the user configures the run.

**Include:**

- Dataset dropdown
- Question type dropdown
- Condition dropdown:
  - Baseline
  - Noise
  - Conflict
  - Unanswerable
- Intensity/ratio dropdowns
- Retrieval settings:
  - top-k
  - top-n
- Model dropdown
- Run button
- Reset button

---

### Center Panel — Chat Interface

Main visual focus.

**Include:**

- Project title / header
- Chat history
- User question bubble
- Assistant answer bubble
- Citations under answer
- Expandable reasoning/evidence view
- Input box at bottom
- Send button

---

### Right Panel — Evidence + Metrics

Where the system becomes powerful.

**Tabs:**

- Evidence
- Perturbation View
- Metrics
- Comparison

**Inside:**

- Retrieved passage cards
- Labels:
  - clean
  - noisy
  - contradictory
  - removed
- Metric cards
- Performance charts
- Baseline vs stressed comparison

---

## 4. Feature Breakdown

### Feature 1: Chat Input

User enters biomedical question.

**Examples:**

- “What are the treatments for pancreatic cancer?”
- “Does drug X improve survival in disease Y?”

**Output:**

- Answer text
- Citations
- “Insufficient Evidence” when applicable

---

### Feature 2: Condition Selector

Most important control.

**Dropdown:**

- Baseline
- Noise
- Conflict
- Unanswerable

#### Dynamic Controls:

**Noise:**

- Intensity: 30%, 50%, 70%
- Type:
  - irrelevant passages
  - near-miss passages

**Conflict:**

- Ratio:
  - 50/50
  - 70/30
- Mode:
  - support vs oppose

**Unanswerable:**

- Level:
  - partial removal
  - full removal

---

### Feature 3: Retrieval Controls

Collapsible advanced section.

**Controls:**

- top-k retrieval
- top-n reranked passages
- chunking strategy
- section filter:
  - Background
  - Methods
  - Results
  - Conclusions

---

### Feature 4: Evidence Viewer

Each evidence chunk displayed as a card.

**Card Content:**

- PMID
- Section
- Snippet text
- Rank
- Perturbation tag

**Color Coding:**

- Blue → baseline
- Orange → noise
- Red → conflict
- Gray → removed/unanswerable

**Optional:**

- Highlight citation text
- Show original vs modified

---

### Feature 5: Metrics Dashboard

#### Retrieval Metrics

- MAP@k
- MRR@k
- nDCG@k

#### Groundedness Metrics

- Supported Claim Rate
- Citation Precision
- Abstention Rate

#### Task Metrics

- EM
- F1
- Accuracy
- ROUGE-L

---

### Feature 6: Comparison Mode

Very strong demo feature.

**Toggle:**

- Single run
- Compare baseline vs stressed

**View:**

- Same question
- Two answer panels
- Two evidence sets
- Side-by-side metric comparison

---

## 5. UI Pages / Screens

### Screen 1: Main Dashboard

- Controls
- Chat
- Evidence + Metrics

---

### Screen 2: Experiment History

- Timestamp
- Question
- Condition
- Model
- Outcome summary

---

### Screen 3: Batch Evaluation (Optional)

- Multiple questions
- Stress sweeps
- Aggregate charts

---

## 6. Recommended Development Phases

### Phase 1 — Visual Shell

- Header
- 3-column layout
- Sidebar controls
- Chat area
- Right panel tabs
- Sample cards

---

### Phase 2 — Interactive Controls

- Working dropdowns
- Sliders
- Dynamic UI changes
- Mock responses

---

### Phase 3 — Backend Integration

Endpoints:

- `/ask`
- `/retrieve`
- `/perturb`
- `/evaluate`
- `/compare`

---

### Phase 4 — Evidence + Metrics Rendering

- Real evidence cards
- Citation links
- Metric cards
- Charts

---

### Phase 5 — Comparison Mode

- Dual answers
- Dual evidence
- Delta metrics

---

## 7. Component Plan

### Layout

- AppLayout
- Header
- LeftControlPanel
- ChatPanel
- RightInsightPanel

### Controls

- DatasetSelect
- ConditionSelect
- ModelSelect
- RetrievalSettings
- PerturbationControls

### Chat

- ChatMessage
- ChatInput
- CitationList
- AnswerCard

### Evidence

- EvidenceCard
- EvidenceList
- PerturbationBadge

### Metrics

- MetricCard
- MetricsGrid
- ComparisonChart

---

## 8. State Management Plan

Use React state or Zustand.

**State Objects:**

- question
- selectedCondition
- selectedIntensity
- selectedModel
- retrievalSettings
- answer
- citations
- evidence
- metrics
- comparisonResult

---

## 9. Best Visual Style

- Soft neutral background
- White cards
- Rounded corners
- Clean typography
- Subtle shadows
- Minimal bright colors
- Strong spacing

**Design Goal:**
AI research dashboard + clinical decision support interface

---

## 10. MVP Version

**Build first:**

- Question input
- Condition dropdown
- Intensity selector
- Send button
- Answer card
- Evidence cards
- Metrics cards

---

## 11. Best Final Version

- Chat interface
- Dynamic experiment controls
- Evidence viewer
- Perturbation labels
- Metrics dashboard
- Baseline vs stressed comparison
- Experiment history

---
