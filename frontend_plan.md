# Frontend: Biomedical RAG Stress-Test Dashboard

## 1. Overview

A research-grade thesis demo app where a user can:

- Ask biomedical questions (BioASQ 13 or free-form)
- Choose perturbation conditions and compare selectively
- Run baseline or stressed retrieval + generation + evaluation
- See answer + citations with PubMed links
- Inspect evidence passages with perturbation labels
- Compare metrics visually (per-question and dataset-level)
- View aggregate analytics across all experiments

---

## 2. Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS**
- **shadcn/ui** (base-nova style, @base-ui/react primitives)
- **Recharts** (BarChart, RadarChart)
- **Zustand** (state management)

---

## 3. Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Main Dashboard | 3-panel layout: controls, chat, evidence/metrics |
| `/analytics` | Analytics | Aggregate condition summary + metric impact views |
| `/history` | History | Expandable experiment history with full metrics |

---

## 4. Main Dashboard (`/`)

### 3-Panel Layout (Resizable)

All three panels are **user-resizable** via drag handles between them. Widths persist in Zustand store with min/max constraints.

#### Left Panel -- Experiment Controls

- **Mode toggle**: Evaluation vs Free Chat (in header)
- **Question type filter**: Dropdown (All / Factoid / List / Yesno / Summary) -- filters question list
- **Question selector**: Scrollable list of BioASQ questions filtered by type
- **Condition dropdown**: clean, noise_30, noise_50, noise_70, conflict_50, conflict_70, unanswerable_partial, unanswerable_full
- **Top-k slider**: 1-20 (default 5)
- **Run button**: Executes /ask pipeline
- **Selective condition comparison**: Checkbox list of all 8 conditions with "Compare N Condition(s)" button (sends only checked conditions to /compare)

#### Center Panel -- Chat Interface

- Chat message history (user + assistant bubbles)
- Answer text with inline citation badges
- Input box + send button at bottom
- **Evaluation mode**: Uses selected BioASQ question, shows full metrics
- **Free chat mode**: Any biomedical question; amber notice about corpus scope (~2,000 PubMed chunks from BioASQ 13); no task metrics

#### Right Panel -- Evidence + Metrics

Tabbed interface:

- **Evidence tab**: Passage cards with PMID (clickable link to PubMed), section, snippet text, rank, perturbation tag. Color-coded: blue (clean), orange (noise), red (conflict), gray (removed).
- **Metrics tab**: Retrieval (MAP@k, MRR@k, nDCG@k, P@k), Groundedness (SCR, Citation Precision, Avg Entailment), Task (Score, Type-specific)
- **Comparison tab**: Grouped bar chart + metric delta cards per condition. Collapsible answer sections showing full generated answer + citation badges for each condition tested.

---

## 5. Analytics Page (`/analytics`)

Two tabs, populated from `GET /aggregate/stats` endpoint:

### Tab 1: Condition Summary (AggregateView)

- **Table 1**: Rows = conditions, columns = all metrics (MAP, MRR, nDCG, P@k, SCR, CP, Entailment, Task). Answers: "which stress condition hurts most?"
- **Bar chart**: Grouped bars showing MAP@k, SCR, Task Score, nDCG per condition
- **Table 2**: Same metrics grouped by question type
- **Radar chart**: Performance profile per question type (MAP, SCR, Task Score)

### Tab 2: Metric Impact (MetricImpactView)

- **Heatmap table**: 3 rows (Retrieval, Groundedness, Task) x all condition columns. Cells colored green-to-red by score. Shows at a glance which perturbation hurts which metric family.
- **Degradation delta chart**: Bar chart showing % change from clean baseline per condition. Negative bars = degradation. Reference line at 0. Answers: "does noise hurt more than conflict?" and "does retrieval degrade first or generation?"

---

## 6. History Page (`/history`)

- Paginated experiment list (newest first)
- Each card is **expandable** (Collapsible component):
  - **Collapsed**: Question (truncated), condition badge, task score, timestamp
  - **Expanded**: Full question, full answer, 3-column metrics grid (retrieval / groundedness / task), passage PMIDs as clickable PubMed links

---

## 7. Two Levels of Analysis

### Per-Question Analysis
- Run single question with any condition via `/ask`
- Compare one question across selected conditions via `/compare`
- View answer text, citations, evidence, and all metrics side-by-side
- Use case: qualitative examples, case studies for thesis

### Dataset-Level / Aggregate Analysis
- Populate DB via `/batch/run` (multiple questions, one condition)
- View aggregate metrics on Analytics page grouped by condition or question type
- Heatmap + degradation charts for thesis results tables/figures
- Use case: quantitative results, statistical comparisons

---

## 8. Component Architecture

### Layout
- `Header` -- mode toggle, nav links (Analytics, History)
- `ResizeHandle` -- drag handle for panel resizing

### Controls
- `ControlPanel` -- question type filter, question list, condition selector, top-k, run button, selective compare checkboxes

### Chat
- `ChatPanel` -- message list, input, mode-specific empty states
- `ChatMessage` -- user/assistant bubbles with citation badges

### Evidence
- `EvidencePanel` -- tab container (Evidence, Metrics, Comparison)
- `EvidenceList` -- passage list with free-chat corpus notice
- `EvidenceCard` -- passage card with clickable PMID PubMed link
- `MetricsView` -- retrieval + groundedness + task metric cards
- `ComparisonView` -- grouped bar chart, metric deltas, collapsible answers per condition

### Analytics
- `AggregateView` -- condition/question-type tables, bar chart, radar chart
- `MetricImpactView` -- heatmap table, degradation delta chart

---

## 9. State Management (Zustand)

Key state slices:

| State | Purpose |
|-------|---------|
| `mode` | "evaluation" or "free-chat" |
| `questionType` | Filter: "all", "factoid", "list", "yesno", "summary" |
| `selectedQuestion` | Currently selected BioASQ question |
| `selectedCondition` | Active perturbation condition |
| `selectedConditions` | Array of checked conditions for comparison |
| `topK` | Retrieval top-k setting |
| `messages` | Chat message history |
| `currentResult` | Latest /ask response |
| `comparisonResult` | Latest /compare response |
| `leftPanelWidth` / `rightPanelWidth` | Resizable panel widths (min/max constrained) |
| `aggregateByCondition` / `aggregateByQuestionType` | Analytics data |
| `analyticsLoading` | Loading state for analytics page |

---

## 10. Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/questions` | GET | List BioASQ questions (filtered by type) |
| `/conditions` | GET | List perturbation conditions |
| `/ask` | POST | Full pipeline: retrieve + perturb + generate + evaluate |
| `/retrieve` | POST | Retrieval only |
| `/perturb` | POST | Apply perturbation to passages |
| `/evaluate` | POST | Evaluate answer against gold |
| `/compare` | POST | Run pipeline across selected conditions |
| `/history` | GET | Experiment history (filterable by condition, question_type, question_id) |
| `/aggregate/stats` | GET | Aggregate metrics grouped by condition or question_type |
| `/batch/run` | POST | Run pipeline on multiple questions with one condition |

---

## 11. Visual Style

- Soft neutral background (`gray-100`)
- White cards with subtle borders
- Rounded corners, clean typography
- Minimal color: blue (retrieval), green (groundedness), amber (task), purple (nDCG)
- Strong spacing, responsive layout
- Research dashboard aesthetic
