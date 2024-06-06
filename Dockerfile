# Use a imagem base do Node.js
FROM node:18

# Instala as dependências necessárias para o Puppeteer
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && apt-get install -y \
        ca-certificates \
        fonts-liberation \
        libappindicator3-1 \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Crie e defina o diretório de trabalho dentro do contêiner
WORKDIR /usr/src/app

# Copie o package.json e package-lock.json para o diretório de trabalho
COPY package*.json ./

# Instale as dependências do projeto
RUN npm install

# Copie o restante do código para o diretório de trabalho
COPY . .

# Exponha a porta em que a aplicação irá rodar
EXPOSE 3000

# Defina a variável de ambiente para o URI do MongoDB
ENV MONGO_URI=mongodb://mongo:27017/wwebjs-bot

# Comando para iniciar a aplicação
CMD ["npm", "start"]
