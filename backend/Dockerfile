FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONOPTIMIZE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/db.py backend/models.py backend/auth.py backend/main.py ./
COPY frontend ./frontend
RUN mkdir -p /data
ENV DATABASE_URL=sqlite:////data/app.db
ENV SECRET_KEY=change-me-in-production
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
