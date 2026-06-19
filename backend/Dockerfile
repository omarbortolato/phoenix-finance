# Stage 1: build deps in a full image
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: lean runtime image
FROM python:3.12-slim
WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy source
COPY . .

# SQLite data directory (mounted as volume in docker-compose)
RUN mkdir -p /app/data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
