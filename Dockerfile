# Use Node 20 runtime
FROM node:20

# Set working directory
WORKDIR /app

# Copy files
COPY . .

# Install dependencies
RUN npm install

# Expose port 3000 (used by server.js or MCP index.js)
EXPOSE 3000

# Start the MCP
CMD ["node", "dist/index.js"]
