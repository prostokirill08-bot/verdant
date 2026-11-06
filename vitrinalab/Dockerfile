FROM mcr.microsoft.com/playwright/python:v1.49.0-noble
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Europe/Moscow
RUN apt-get update && apt-get install -y --no-install-recommends fonts-inter curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# модель сегментации U²-Net (Apache-2.0); u2net.onnx (176 МБ) точнее, u2netp (4.6 МБ) быстрее
RUN mkdir -p /models && curl -fsSL -o /models/u2netp.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
ENV CUTOUT_MODEL_PATH=/models/u2netp.onnx DATA_DIR=/app/data
COPY app ./app
COPY scripts ./scripts
# в образе Playwright уже есть непривилегированный пользователь pwuser
RUN mkdir -p /app/data && chown -R pwuser /app
USER pwuser
EXPOSE 8000
CMD ["uvicorn", "app.web.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
