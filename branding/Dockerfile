# 官方 Logto 之上的薄 overlay：只加静态资源并改一行 index.html，不改 Logto 源码。
# 升级时改 LOGTO_VERSION 重新 build 即可。
ARG LOGTO_VERSION=1.42.0
FROM svhd/logto:${LOGTO_VERSION}

COPY assets/ /etc/logto/packages/console/dist/assets/
COPY assets/lw-logo.svg /etc/logto/packages/experience/dist/assets/lw-logo.svg
COPY assets/lw-experience.js /etc/logto/packages/experience/dist/assets/lw-experience.js
COPY patch-console.mjs /tmp/patch-console.mjs
RUN node /tmp/patch-console.mjs && rm /tmp/patch-console.mjs
