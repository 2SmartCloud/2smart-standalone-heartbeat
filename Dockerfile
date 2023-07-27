FROM node:12.5-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh tzdata

COPY app.js app.js
COPY lib lib
COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm i --production

CMD npm start
