"""
FastAPI backend wrapping the RAG stress-test pipeline.

Endpoints:
  POST /ask        -- full pipeline: retrieve + generate + evaluate
  POST /retrieve   -- retrieval only
  POST /perturb    -- apply perturbation to passages
  POST /evaluate   -- evaluate answer against gold
  POST /compare    -- compare metrics across conditions
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="RAG Stress-Test API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
