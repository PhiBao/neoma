import { ethers } from "ethers";

// Minimal ABI for reading market info
const MARKET_ABI = [
  "function question() view returns (string)",
  "function state() view returns (uint8)",
  "function totalVoters() view returns (uint256)",
  "function options() view returns (string[])",
  "function optionCount() view returns (uint256)",
];

const STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Resolving",
  2: "Resolved",
  3: "Expired",
  4: "Cancelled",
};

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // Only handle requests with a market address in the hash fragment
  // Since hash fragments aren't sent to the server, we also support ?market=0x...
  const marketAddr = url.searchParams.get("market");

  if (!marketAddr || !/^0x[a-fA-F0-9]{40}$/.test(marketAddr)) {
    // Not a market link — return generic OG tags
    return new Response(
      buildOGHtml(url.origin, "Neoma — Encrypted Opinion Markets", "Privacy-preserving opinion markets powered by Fully Homomorphic Encryption", "", ""),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const ua = req.headers.get("user-agent") ?? "";
  const isCrawler =
    /\bbot\b|crawl|slurp|spider|facebookexternalhit|twitterbot|telegrambot|discordbot|whatsapp|linkedinbot|slackbot/i.test(ua);

  if (!isCrawler) {
    // Regular browser — redirect to the SPA with hash routing
    return Response.redirect(`${url.origin}/#market=${marketAddr}`, 302);
  }

  // Crawler — generate OG meta tags
  let title = "Neoma — Encrypted Opinion Market";
  let description = "Privacy-preserving opinion market powered by Fully Homomorphic Encryption";
  let extra = "";

  try {
    const rpcUrl = process.env.RPC_URL || `https://sepolia.infura.io/v3/${process.env.INFURA_KEY}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const market = new ethers.Contract(marketAddr, MARKET_ABI, provider);

    const [question, state, totalVoters, options] = await Promise.all([
      market.question(),
      market.state().then(Number),
      market.totalVoters().then(Number),
      market.options() as Promise<string[]>,
    ]);

    title = question;
    const stateLabel = STATE_LABELS[state] ?? "Unknown";
    description = `${stateLabel} · ${totalVoters} voter${totalVoters !== 1 ? "s" : ""} · ${options.join(" vs ")}`;
    extra = options.map((o) => `<meta property="og:label" content="${escapeHtml(o)}" />`).join("\n    ");
  } catch (err) {
    console.error("[og] Failed to fetch market data:", err);
    // Falls through with generic title/description
  }

  const html = buildOGHtml(url.origin, title, description, extra, marketAddr);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
    },
  });
}

function buildOGHtml(origin: string, title: string, description: string, extra: string, marketAddr: string): string {
  const marketUrl = marketAddr ? `${origin}/#market=${marketAddr}` : origin;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${marketUrl}" />
  <meta property="og:site_name" content="Neoma" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${extra}
  <meta http-equiv="refresh" content="0; url=${marketUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${marketUrl}">${escapeHtml(title)}</a></p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
