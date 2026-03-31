export interface DemoPassage {
  title: string;
  snippet: string;
  pmid: string;
  rank: number;
  label: "clean" | "noise" | "conflict" | "removed";
}

export interface DemoMetrics {
  map_at_k: number;
  mrr_at_k: number;
  ndcg_at_k: number;
  supported_claim_rate: number;
  citation_precision: number;
  task_score: number;
}

export interface DemoQuestion {
  id: string;
  body: string;
  type: string;
  goldAnswer: string;
  passages: DemoPassage[];
  generatedAnswer: string;
  metrics: DemoMetrics;
}

export const demoQuestions: DemoQuestion[] = [
  {
    id: "q1",
    body: "What is the role of metformin in treating type 2 diabetes?",
    type: "summary",
    goldAnswer:
      "Metformin is the first-line pharmacotherapy for type 2 diabetes. It works primarily by decreasing hepatic glucose production and improving insulin sensitivity in peripheral tissues.",
    passages: [
      {
        title: "Metformin: A Review of Its Metabolic Effects",
        snippet:
          "Metformin remains the first-line agent for type 2 diabetes management. Its primary mechanism involves suppression of hepatic glucose production via activation of AMP-activated protein kinase (AMPK).",
        pmid: "29876543",
        rank: 1,
        label: "clean",
      },
      {
        title: "Insulin Sensitizers in Clinical Practice",
        snippet:
          "Beyond glycemic control, metformin improves insulin sensitivity in peripheral tissues, particularly skeletal muscle, facilitating glucose uptake independent of insulin secretion.",
        pmid: "31234567",
        rank: 2,
        label: "clean",
      },
      {
        title: "Cardiovascular Benefits of Metformin Therapy",
        snippet:
          "Long-term metformin use has been associated with reduced cardiovascular mortality in diabetic patients, making it a cornerstone of diabetes management guidelines worldwide.",
        pmid: "30567890",
        rank: 3,
        label: "clean",
      },
      {
        title: "Gastrointestinal Tolerability of Biguanides",
        snippet:
          "Common side effects of metformin include gastrointestinal symptoms such as nausea, diarrhea, and abdominal discomfort, which typically resolve with dose titration.",
        pmid: "28901234",
        rank: 4,
        label: "clean",
      },
      {
        title: "SGLT2 Inhibitors as Adjunct Therapy",
        snippet:
          "When metformin monotherapy fails to achieve glycemic targets, SGLT2 inhibitors or GLP-1 receptor agonists are recommended as second-line agents.",
        pmid: "32456789",
        rank: 5,
        label: "clean",
      },
    ],
    generatedAnswer:
      "Metformin is the first-line pharmacotherapy for type 2 diabetes [1]. It works primarily by suppressing hepatic glucose production through activation of AMP-activated protein kinase (AMPK) [1] and improving insulin sensitivity in peripheral tissues, particularly skeletal muscle [2]. Long-term use has also been associated with cardiovascular benefits [3].",
    metrics: {
      map_at_k: 0.92,
      mrr_at_k: 1.0,
      ndcg_at_k: 0.95,
      supported_claim_rate: 0.95,
      citation_precision: 1.0,
      task_score: 0.82,
    },
  },
  {
    id: "q2",
    body: "Is BRCA1 associated with increased risk of breast cancer?",
    type: "yesno",
    goldAnswer: "Yes",
    passages: [
      {
        title: "BRCA1 Mutations and Cancer Risk",
        snippet:
          "Germline mutations in BRCA1 confer a cumulative lifetime risk of breast cancer estimated at 57-65%, significantly higher than the 12% population baseline risk.",
        pmid: "27654321",
        rank: 1,
        label: "clean",
      },
      {
        title: "Hereditary Breast Cancer Syndromes",
        snippet:
          "BRCA1, a tumor suppressor gene located on chromosome 17q21, plays a critical role in DNA double-strand break repair. Loss of function mutations lead to genomic instability and increased cancer susceptibility.",
        pmid: "29012345",
        rank: 2,
        label: "clean",
      },
      {
        title: "Prophylactic Measures for BRCA Carriers",
        snippet:
          "Risk-reducing mastectomy in BRCA1 mutation carriers decreases breast cancer incidence by approximately 90%, supporting the strong causal link between BRCA1 dysfunction and breast cancer development.",
        pmid: "30234567",
        rank: 3,
        label: "clean",
      },
      {
        title: "BRCA1 in Triple-Negative Breast Cancer",
        snippet:
          "BRCA1-associated breast cancers are predominantly triple-negative subtype, lacking estrogen receptor, progesterone receptor, and HER2 expression.",
        pmid: "31567890",
        rank: 4,
        label: "clean",
      },
      {
        title: "Genetic Counseling for Familial Cancer",
        snippet:
          "Individuals with a family history of breast or ovarian cancer should be referred for genetic counseling and possible BRCA1/2 testing.",
        pmid: "28345678",
        rank: 5,
        label: "clean",
      },
    ],
    generatedAnswer:
      "Yes. BRCA1 germline mutations confer a cumulative lifetime breast cancer risk of 57-65%, far exceeding the 12% population baseline [1]. BRCA1 is a tumor suppressor involved in DNA repair, and its loss of function leads to genomic instability [2]. Risk-reducing mastectomy in carriers decreases incidence by approximately 90%, confirming the causal association [3].",
    metrics: {
      map_at_k: 0.88,
      mrr_at_k: 1.0,
      ndcg_at_k: 0.91,
      supported_claim_rate: 1.0,
      citation_precision: 1.0,
      task_score: 1.0,
    },
  },
  {
    id: "q3",
    body: "Which drugs are used for treatment of Parkinson's disease?",
    type: "list",
    goldAnswer:
      "Levodopa, carbidopa, dopamine agonists (pramipexole, ropinirole), MAO-B inhibitors (selegiline, rasagiline), COMT inhibitors (entacapone), amantadine, anticholinergics",
    passages: [
      {
        title: "Pharmacological Management of Parkinson's Disease",
        snippet:
          "Levodopa combined with carbidopa remains the most effective symptomatic treatment for Parkinson's disease. Dopamine agonists such as pramipexole and ropinirole are alternatives for initial therapy in younger patients.",
        pmid: "28765432",
        rank: 1,
        label: "clean",
      },
      {
        title: "MAO-B Inhibitors in Early Parkinson's",
        snippet:
          "Monoamine oxidase type B (MAO-B) inhibitors, including selegiline and rasagiline, provide modest symptomatic benefit and may be used as initial monotherapy or as adjuncts to levodopa.",
        pmid: "30123456",
        rank: 2,
        label: "clean",
      },
      {
        title: "COMT Inhibitors for Motor Fluctuations",
        snippet:
          "Catechol-O-methyltransferase (COMT) inhibitors such as entacapone and opicapone extend the duration of levodopa effect by blocking peripheral dopamine metabolism.",
        pmid: "29345678",
        rank: 3,
        label: "clean",
      },
      {
        title: "Amantadine for Levodopa-Induced Dyskinesia",
        snippet:
          "Amantadine, an NMDA receptor antagonist, is the only medication with demonstrated efficacy for levodopa-induced dyskinesia in Parkinson's disease.",
        pmid: "31456789",
        rank: 4,
        label: "clean",
      },
      {
        title: "Deep Brain Stimulation Advances",
        snippet:
          "For patients with advanced Parkinson's disease who experience motor fluctuations despite optimal medical therapy, deep brain stimulation of the subthalamic nucleus offers significant improvement.",
        pmid: "32567890",
        rank: 5,
        label: "clean",
      },
    ],
    generatedAnswer:
      "The main drugs used for Parkinson's disease include: Levodopa/carbidopa (most effective symptomatic treatment) [1], dopamine agonists such as pramipexole and ropinirole [1], MAO-B inhibitors including selegiline and rasagiline [2], COMT inhibitors like entacapone [3], and amantadine for dyskinesia management [4].",
    metrics: {
      map_at_k: 0.85,
      mrr_at_k: 1.0,
      ndcg_at_k: 0.89,
      supported_claim_rate: 0.9,
      citation_precision: 0.95,
      task_score: 0.78,
    },
  },
];
