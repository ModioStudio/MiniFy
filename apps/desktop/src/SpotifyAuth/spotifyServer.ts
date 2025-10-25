import path from "node:path";
import { type BunRequest, serve } from "bun";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const PORT = 3000;
let codeVerifier = "";
let cachedTokens: Record<string, unknown> | null = null;

function generateCodeVerifier(length = 128) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

async function generateCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const CLIENT_ID = process.env.CLIENT_ID || "";
console.log("CLIENT_ID:", process.env.CLIENT_ID);
const REDIRECT_URI = "http://127.0.0.1:3000/callback";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
];

serve({
  port: PORT,
  async fetch(req: BunRequest) {
    const url = new URL(req.url);

    const headers = new Headers({
      "Access-Control-Allow-Origin": "http://localhost:1420",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    });

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/login") {
      codeVerifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(codeVerifier);

      const authUrl = new URL("https://accounts.spotify.com/authorize");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES.join(" "));
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("code_challenge", challenge);

      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code)
        return new Response(JSON.stringify({ error: "Kein Code empfangen" }), {
          status: 400,
          headers,
        });

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: codeVerifier,
      });

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      cachedTokens = await tokenRes.json();
      console.log("Erhaltene Tokens:", cachedTokens);

      console.log("Spotify-Tokens in settings.json aktualisiert!");

      return new Response(
        `
  <!DOCTYPE html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <title>Spotify Login Erfolgreich</title>
      <style>
        body {
          margin: 0;
          font-family: "Segoe UI", Roboto, sans-serif;
          background: linear-gradient(135deg, #171717, #101010);
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          color: #fff;
          text-align: center;
        }
        .container {
          background: rgba(0, 0, 0, 0.6);
          padding: 2rem 3rem;
          border-radius: 12px;
          box-shadow: 0 8px 20px rgba(0,0,0,0.4);
          max-width: 400px;
        }
        h1 {
          font-size: 1.8rem;
          margin-bottom: 1rem;
        }
        p {
          margin-bottom: 1.5rem;
        }
        button {
          background-color: #fff;
          color: #1db954;
          font-weight: bold;
          padding: 0.6rem 1.2rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: 0.2s;
        }
        button:hover {
          background-color: #1ed760;
          color: #fff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Spotify Login Erfolgreich!</h1>
        <p>Du kannst dieses Fenster jetzt schließen.</p>
        <button onclick="window.close()">Fenster schließen</button>
      </div>
    </body>
  </html>
  `,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (url.pathname === "/tokens") {
      if (cachedTokens) {
        return new Response(JSON.stringify(cachedTokens), { headers });
      }
      return new Response(JSON.stringify({ error: "Noch keine Tokens" }), { status: 404, headers });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers });
  },
});

console.log(`Spotify OAuth Server läuft auf http://127.0.0.1:${PORT}`);
