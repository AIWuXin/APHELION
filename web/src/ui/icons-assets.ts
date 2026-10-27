import { asset, CERAMIC, FUNCTION, isoBox, ORANGE, poly } from './icon-kit';

const B = (key: string, body: string): string => asset(key, body);
const U = (key: string, body: string): string => asset(key, body);

const hub = B('command-hub', `<ellipse cx="24" cy="27" rx="19" ry="7" fill="currentColor" fill-opacity=".22"/>${isoBox(24, 23, 9, 7, 14)}${isoBox(24, 12, 13, 3, 3)}<path d="M24 7V2M19 8h10" stroke="${ORANGE}"/><ellipse cx="24" cy="27" rx="16" ry="5" stroke="${ORANGE}"/>`);
const solar = B('solar-array', `<path d="M10 26v5m13-8v8m13-11v7"/>` + ([[3, 13], [18, 9], [13, 22], [28, 18]] as const).map(([x, y]) => poly([[x, y], [x + 12, y - 4], [x + 17, y + 2], [x + 5, y + 6]], FUNCTION)).join('') + `<path d="M4 32h38"/>`);
const refinery = B('refinery', `${poly([[3, 20], [14, 15], [17, 25], [6, 28]], 'currentColor')}<path d="M9 23l19 6" stroke="${ORANGE}"/><path d="M22 12v15c0 5 14 5 14 0V12" fill="${CERAMIC}"/><ellipse cx="29" cy="12" rx="7" ry="3" fill="${CERAMIC}"/><ellipse cx="29" cy="26" rx="7" ry="3"/><path d="M29 9V4M22 19h14"/>`);
const fuel = B('fuel-synth', `<ellipse cx="14" cy="21" rx="7" ry="9" fill="${CERAMIC}"/><ellipse cx="29" cy="21" rx="7" ry="9" fill="${CERAMIC}"/><path d="M7 21h14m1 0h14M38 29V5h4v24M37 10h6M37 17h6"/><path d="M5 30h37" stroke="${ORANGE}"/>`);
const lab = B('research-lab', `<path d="M5 29h38M8 29V21a13 13 0 0 1 26 0v8" fill="${CERAMIC}"/><path d="M21 8v21M10 22h24M29 29v-9h12v9" fill="${FUNCTION}" fill-opacity=".5"/><path d="M30 15l7-9 4 3-7 9" fill="${CERAMIC}"/>`);
const pad = B('launch-pad', `${poly([[5, 23], [23, 16], [43, 23], [43, 29], [23, 35], [5, 29]], 'currentColor')}<path d="M25 3c5 5 6 12 4 21l-5 4-5-4c0-9 2-16 6-21Z" fill="${CERAMIC}"/><path d="M19 20l-5 8 6-2m9-6 5 8-6-2M36 28V8h5v20M36 13h5"/><path d="M22 29h5" stroke="${ORANGE}"/>`);
const dock = B('freight-dock', `<path d="M5 31V5h34v26M5 9h34M23 9v9h5v5"/><path d="M6 31h35"/>${isoBox(15, 25, 6, 5, 5)}${isoBox(29, 26, 6, 4, 4)}<path d="M23 23h10" stroke="${ORANGE}"/>`);
const relay = B('relay-mast', `<path d="M15 31L25 4l8 27M19 21h11M17 27h14M21 14h7M12 32h26"/><path d="M25 10Q37 5 40 10Q34 20 25 15Z" fill="${CERAMIC}"/><path d="M29 13l8 7M36 5a8 8 0 0 1 6 4" stroke="${FUNCTION}"/>`);
const turret = B('rail-turret', `<ellipse cx="21" cy="28" rx="14" ry="5" fill="currentColor" fill-opacity=".25"/>${isoBox(21, 25, 7, 6, 7)}<path d="M16 17l6-5 7 3-5 6Z" fill="${CERAMIC}"/><path d="M22 14L43 5M24 18l21-9" stroke="${CERAMIC}" stroke-width="3"/><path d="M10 30h22" stroke="${ORANGE}"/>`);
const flak = B('flak-battery', `${isoBox(22, 26, 11, 7, 7)}<path d="M15 19L9 5m12 13-2-16m7 16 3-15m1 17 9-13" stroke="${CERAMIC}" stroke-width="3"/><path d="M7 5l3 1m8-4 3 1m10-1 3 1m5 3 3 2" stroke="${ORANGE}"/>`);
const bulwark = B('bulwark', `${isoBox(24, 24, 18, 7, 10)}<path d="M11 23v-5h6v5m6 4v-5h6v5m6 0v-5h6v5" fill="var(--oc-void)"/><path d="M6 30h36" stroke="${ORANGE}"/>`);
const hangar = B('hangar', `<path d="M4 31h40M7 31V19a17 15 0 0 1 34 0v12" fill="${CERAMIC}"/><path d="M14 31V20h20v11" fill="var(--oc-void)"/><path d="M12 31V18h24v13M18 24h12" stroke="${ORANGE}"/>`);
const radar = B('radar-array', `${isoBox(18, 26, 7, 6, 8)}<path d="M21 24l9-10"/><path d="M15 7Q30 4 43 8Q36 25 22 21Z" fill="${CERAMIC}"/><path d="M19 10q10 9 19 1M30 14l10 12"/><path d="M38 3a9 9 0 0 1 5 3" stroke="${FUNCTION}"/>`);
const repair = B('repair-bay', `<path d="M4 31h40M7 31V7h12v24M7 11h12M28 31V7h12v24M28 11h12"/><path d="M19 13h10v7H19Z" fill="${FUNCTION}" fill-opacity=".3"/><path d="M24 22v9m-5-4h10" stroke="${ORANGE}" stroke-width="2"/><path d="M19 31h10"/>`);
const mine = B('coal-mine', `<circle cx="14" cy="21" r="10" fill="currentColor" fill-opacity=".25"/><circle cx="14" cy="21" r="6" fill="${CERAMIC}"/><path d="M14 11v20M4 21h20M7 14l14 14M7 28l14-14"/>${poly([[19, 22], [36, 12], [40, 17], [22, 28]], 'currentColor')}<path d="M20 22l17-8" stroke="${ORANGE}"/>${isoBox(38, 14, 4, 6, 5)}`);
const plant = B('coal-plant', `${isoBox(18, 24, 10, 9, 14)}<path d="M31 30V5h7v25M30 10h9M30 17h9" fill="${CERAMIC}"/><path d="M33 3h5M12 24h12v6H12Z" fill="${ORANGE}"/><path d="M4 32h40"/>`);

const oilWell = B('oil-well', `<path d="M5 30h38M10 30l7-22 7 22M14 20h7M19 16l18-5M36 11v16M32 30h10V16h-7v14" fill="${CERAMIC}"/><path d="M17 8l7-4 13 4" stroke="${ORANGE}"/>`);
const freightTrain = U('freight-train', `${isoBox(11, 22, 7, 5, 6)}${isoBox(25, 22, 7, 5, 6)}${isoBox(36, 21, 5, 6, 8)}<path d="M5 30h38M18 20h4M31 20h4" stroke="${ORANGE}"/>`);

export const ICON_B_REPAIR = repair;
export const BUILDING_ICONS: readonly string[] = [hub, solar, refinery, fuel, lab, pad, dock, relay, turret, flak, bulwark, hangar, radar, repair, mine, plant, oilWell];
export const UNIT_ICONS: readonly string[] = [
  U('raider', `${poly([[24, 5], [38, 24], [24, 20], [10, 24]], CERAMIC)}<path d="M24 20v9M14 30h20M18 15l6-5 6 5" stroke="${FUNCTION}"/>`),
  U('siege-walker', `${isoBox(24, 17, 9, 8, 8)}<path d="M15 23l-5 10m23-10 5 10M10 33h9m10 0h9M27 15l16-6" stroke="${CERAMIC}" stroke-width="3"/><path d="M14 18h20" stroke="${ORANGE}"/>`),
  U('dropship', `${poly([[24, 3], [36, 15], [32, 26], [24, 22], [16, 26], [12, 15]], CERAMIC)}<path d="M13 17l-7 9m29-9 7 9M24 23v9M17 32h14" stroke="${FUNCTION}"/>`),
  U('interceptor', `${poly([[24, 3], [30, 16], [45, 25], [28, 23], [24, 30], [20, 23], [3, 25], [18, 16]], CERAMIC)}<path d="M24 8v14M17 23h14" stroke="${FUNCTION}"/>`),
  U('hauler', `${isoBox(20, 20, 9, 9, 10)}${isoBox(34, 23, 5, 6, 6)}<ellipse cx="14" cy="30" rx="4" ry="2"/><ellipse cx="29" cy="31" rx="4" ry="2"/><ellipse cx="39" cy="28" rx="4" ry="2"/><path d="M7 33h34" stroke="${ORANGE}"/>`),
  U('warship', `${poly([[3, 20], [31, 9], [44, 15], [29, 27], [9, 28]], CERAMIC)}<path d="M18 17l11-9 7 4-10 9M19 23l-5 8m14-11-3 11" fill="${FUNCTION}"/><path d="M8 23h24" stroke="${ORANGE}"/>`),
  U('survey-drone', `<path d="M12 12l24 14M12 26l24-14"/><ellipse cx="9" cy="10" rx="7" ry="3" fill="${CERAMIC}"/><ellipse cx="39" cy="10" rx="7" ry="3" fill="${CERAMIC}"/><ellipse cx="9" cy="28" rx="7" ry="3" fill="${CERAMIC}"/><ellipse cx="39" cy="28" rx="7" ry="3" fill="${CERAMIC}"/>${isoBox(24, 20, 5, 5, 5)}<path d="M24 18v6" stroke="${FUNCTION}"/>`),  freightTrain,
];
