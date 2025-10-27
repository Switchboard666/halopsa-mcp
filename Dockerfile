FROM node:20

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build || echo "no build step"

EXPOSE 3000
CMD ["node", "dist/index.js"]
