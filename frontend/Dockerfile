FROM node:22-slim

WORKDIR /app/frontend

COPY frontend/package*.json /app/frontend/
RUN npm install

COPY frontend /app/frontend

EXPOSE 5173
CMD ["npm", "run", "dev"]
