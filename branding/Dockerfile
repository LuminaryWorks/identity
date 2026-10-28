# 官方 Logto 之上的薄 overlay：只加静态资源并改一行 index.html，不改 Logto 源码。
# 升级时改 LOGTO_VERSION 重新 build 即可。
# Logto 1.22 的 import assert 只能跑在 Node 20。Node 20 已停止维护，没有
# 2026-10-21 安全版；升到 Node 22.23.4 会在启动时语法错误。要吃那批补丁，
# 必须连 Logto 一起升到已用 Node 22 构建的版本，不能只换二进制。
ARG LOGTO_VERSION=1.42.0
FROM svhd/logto:${LOGTO_VERSION}

COPY assets/ /etc/logto/packages/console/dist/assets/
COPY assets/lw-logo.svg /etc/logto/packages/experience/dist/assets/lw-logo.svg
COPY assets/lw-experience.js /etc/logto/packages/experience/dist/assets/lw-experience.js
COPY patch-console.mjs /tmp/patch-console.mjs
RUN node /tmp/patch-console.mjs && rm /tmp/patch-console.mjs
