FROM groovy:4.0-jdk17

WORKDIR /app

# Copy scripts
COPY warm-cache.groovy .
COPY server.groovy .

# Expose port
EXPOSE 8090

# Pre-download dependencies (Grape cache warm-up for faster subsequent starts)
RUN groovy warm-cache.groovy || true

# Health check (Debian-based image has curl)
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:8090/health || exit 1

# Run the server
CMD ["groovy", "server.groovy"]
