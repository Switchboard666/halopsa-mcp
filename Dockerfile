# Use Node 20
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and source
COPY . .

# Install dependencies with npm
RUN npm install

# Build step (if applicable)
RUN npm run build || echo "no build step"

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
