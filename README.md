# Spotify Data

Client-side app for exploring your Spotify extended streaming history. Run with `npm install`, then `npm run dev`. Also available: `npm test`, `npm run build`, and `npm run lint`. Stack: React 19, Vite 6, React Router 7, TanStack Table 8, Recharts 3, fflate 0.8, Vitest 3.

Request the **extended streaming history** from [Spotify’s privacy settings](https://www.spotify.com/account/privacy/) (account data → extended streaming history). Delivery can take up to 30 days. The smaller past-year “account data” package is not supported.

Nothing is uploaded to a server. Files are parsed in your browser and stay on your device.
