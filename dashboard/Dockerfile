FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app.py .
COPY templates/ templates/
COPY static/ static/

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "app.py"]
