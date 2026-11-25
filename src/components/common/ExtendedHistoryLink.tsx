/**
 * Link to the Spotify page where the extended streaming history is requested.
 * Every copy of this link opens in a new tab.
 */

import type { ReactNode } from "react";

/** Spotify’s account privacy page, where the extended history is requested. */
export const SPOTIFY_PRIVACY_URL = "https://www.spotify.com/account/privacy/";

type ExtendedHistoryLinkProps = {
  children: ReactNode;
};

/** Renders the privacy-page link. Input is the link text. */
export function ExtendedHistoryLink({ children }: ExtendedHistoryLinkProps) {
  return (
    <a href={SPOTIFY_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
