FROM node:alpine

WORKDIR /app
COPY package-lock.json .
COPY package.json .

RUN npm ci
COPY . .
CMD [ "npm","start" ]