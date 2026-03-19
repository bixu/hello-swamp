FROM denoland/deno:alpine
WORKDIR /app
COPY app.ts index.html ./
EXPOSE 3000
CMD ["run", "--allow-net", "--allow-read=.", "app.ts"]
