# Microsoft's Playwright image ships Python + Node + all system deps for
# chromium/webkit/firefox. Saves ~5 min of apt-get on every build vs
# installing on top of python:3.12-slim.
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers only (system deps already present in base image)
RUN playwright install chromium

COPY . .

RUN mkdir -p generated

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
