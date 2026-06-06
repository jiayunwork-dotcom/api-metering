FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY .npmrc ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && npm start"]
