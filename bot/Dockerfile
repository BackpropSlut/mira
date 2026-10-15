# Образ для любого VPS (Timeweb, Selectel, Yandex Cloud и т.п.): docker build -t mira-bot . && docker run --env-file .env mira-bot
FROM node:22-alpine
WORKDIR /app

# Корневой сертификат НУЦ Минцифры: без него Node не доверяет серверам GigaChat.
ADD https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt /app/certs/russian_trusted_root_ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem

COPY package.json ./
COPY src ./src
EXPOSE 8080
USER node
CMD ["node", "src/main.js"]
