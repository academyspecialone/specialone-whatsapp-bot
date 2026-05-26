FROM node:22-bullseye

RUN apt-get update && apt-get install -y \
  chromium \
  libglib2.0-0 \
  libnss3 \
  libxss1 \
  libatk-bridge2.0-0 \
  libgtk-3-0 \
  libgbm-dev \
  libasound2 \
  fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
