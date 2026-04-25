import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  anthropic: {
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
  },
  gmail: {
    clientId: requireEnv("GMAIL_CLIENT_ID"),
    clientSecret: requireEnv("GMAIL_CLIENT_SECRET"),
    redirectUri: process.env.GMAIL_REDIRECT_URI ?? "http://localhost:3000/oauth2callback",
  },
  digest: {
    to: requireEnv("DIGEST_TO"),
    lookbackHours: 24,
  },
};
