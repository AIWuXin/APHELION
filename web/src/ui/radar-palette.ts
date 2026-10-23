import { PALETTE, SIGNAL } from '../style/tokens';

/** The scan stays a dark display even though its surrounding panel is light. */
export const RADAR_PALETTE = {
  ...PALETTE,
  ...SIGNAL,
  ink3: PALETTE.inkInverse,
} as const;
