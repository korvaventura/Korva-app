FROM node:20-slim

# Instalar Python, LibreOffice y dependencias
RUN apt-get update && apt-get install -y \
    python3 python3-pip \
    libreoffice \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar python-pptx
RUN pip3 install python-pptx --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]