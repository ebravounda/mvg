# MVG Computación — Backend FastAPI
FROM python:3.11-slim

WORKDIR /app

# System deps for Pillow / openpyxl
RUN apt-get update && apt-get install -y --no-install-recommends \
      libjpeg-dev zlib1g-dev gcc curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8001/api/ || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers", "--forwarded-allow-ips=*"]
