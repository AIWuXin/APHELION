/**
 * Command encoder.
 *
 * The client never sends JSON: commands are appended to a postcard buffer and
 * handed to the transport as bytes (invariant: binary protocol only).
 */

import type { Command } from '../generated/Command';
import { Writer } from './postcard';

/** Variant indices, in the exact declaration order of `oc_protocol::Command`. */
const VARIANT = {
  place: 0,
  demolish: 1,
  launch: 2,
  toggleRoute: 3,
  setSandbox: 4,
  setSpeed: 5,
  pause: 6,
  research: 7,
  setAi: 8,
} as const;

function encodeCommand(w: Writer, command: Command): void {
  if ('place' in command) {
    w.u32(VARIANT.place).u8(command.place.kind).u32(command.place.tx).u32(command.place.ty);
  } else if ('demolish' in command) {
    w.u32(VARIANT.demolish).u32(command.demolish.id);
  } else if ('launch' in command) {
    w.u32(VARIANT.launch).u32(command.launch.id);
  } else if ('toggleRoute' in command) {
    w.u32(VARIANT.toggleRoute).u8(command.toggleRoute.route);
  } else if ('setSandbox' in command) {
    w.u32(VARIANT.setSandbox).u32(command.setSandbox.flags);
  } else if ('setSpeed' in command) {
    w.u32(VARIANT.setSpeed).u8(command.setSpeed.speed);
  } else if ('pause' in command) {
    w.u32(VARIANT.pause).bool(command.pause.paused);
  } else if ('setAi' in command) {
    w.u32(VARIANT.setAi).u8(command.setAi.phase).u8(command.setAi.strength);
  } else {
    w.u32(VARIANT.research).u8(command.research.tech);
  }
}

/**
 * Encode a command batch.
 *
 * @param commands ordered commands, applied atomically at the next tick
 * @param clientTick the client frame the batch was produced on (diagnostics)
 */
export function encodeCommandBatch(commands: readonly Command[], clientTick = 0): Uint8Array {
  const w = new Writer();
  w.u32(clientTick);
  w.u32(commands.length);
  for (const command of commands) encodeCommand(w, command);
  return w.finish();
}
