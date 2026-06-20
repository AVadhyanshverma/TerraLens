FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the server directory (which contains both backend and frontend)
COPY server/ ./server/

# Expose the default port for Hugging Face Spaces
EXPOSE 7860

# Ensure Python can find the modules
ENV PYTHONPATH=/app

# Run the FastAPI application using Uvicorn
CMD ["uvicorn", "server.backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
