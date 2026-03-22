#!/bin/bash
# RAG Stress-Test -- run both backend and frontend
# Usage: ./run.sh

cd "$(dirname "$0")"

echo "Starting FastAPI backend on :8000..."
source venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

echo "Starting Next.js frontend on :3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!

cd ..

echo ""
echo "Backend:  http://localhost:8000  (PID $BACKEND_PID)"
echo "Frontend: http://localhost:3000  (PID $FRONTEND_PID)"
echo "API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
