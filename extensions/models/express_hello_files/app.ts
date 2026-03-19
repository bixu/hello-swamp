const template = await Deno.readTextFile("index.html");

async function getRandomWikiImage(): Promise<{
  imgUrl: string;
  articleUrl: string;
  articleTitle: string;
}> {
  const ua = { headers: { "Api-User-Agent": "SwampExpressHello/1.0" } };
  const res = await fetch(
    "https://en.wikipedia.org/w/api.php?action=query&generator=random" +
      "&grnnamespace=6&grnlimit=10&prop=imageinfo|fileusage" +
      "&iiprop=url|mime&iiurlwidth=800&fulimit=1&format=json",
    ua,
  );
  const data = await res.json();
  if (!data.query || !data.query.pages) {
    return { imgUrl: "", articleUrl: "", articleTitle: "" };
  }
  const pages = Object.values(data.query.pages) as any[];
  const images = pages.filter(
    (p: any) =>
      p.imageinfo?.[0]?.mime?.startsWith("image/") &&
      p.fileusage?.length > 0,
  );
  if (images.length === 0) {
    return { imgUrl: "", articleUrl: "", articleTitle: "" };
  }
  const pick = images[Math.floor(Math.random() * images.length)];
  const imgUrl = pick.imageinfo[0].thumburl || pick.imageinfo[0].url;
  const article = pick.fileusage[0];
  const articleUrl = "https://en.wikipedia.org/wiki/" +
    encodeURIComponent(article.title.replace(/ /g, "_"));
  return { imgUrl, articleUrl, articleTitle: article.title };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve({ port: 3000 }, async (_req: Request): Promise<Response> => {
  const { imgUrl, articleUrl, articleTitle } = await getRandomWikiImage();
  let imageBlock: string;
  if (imgUrl) {
    imageBlock = '<a href="' + escapeHtml(articleUrl) + '" target="_blank">' +
      '<img src="' + escapeHtml(imgUrl) + '" />' +
      "</a>" +
      '<p>From: <a href="' + escapeHtml(articleUrl) + '" target="_blank">' +
      escapeHtml(articleTitle) +
      "</a></p>";
  } else {
    imageBlock = "<p>No image found, refresh to try again.</p>";
  }
  return new Response(template.replace("{{IMAGE_BLOCK}}", imageBlock), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
