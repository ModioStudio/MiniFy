export async function exchangeSpotifyCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string
) {
  const verifier = localStorage.getItem("spotify_verifier");
  if (!verifier) {
    throw new Error("No code verifier found");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return res.json();
}
