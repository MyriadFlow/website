FROM node:alpine as builder

WORKDIR /app
COPY package-lock.json .
COPY package.json .

RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

WORKDIR /app
COPY --from=builder /app/dist /usr/share/nginx/html