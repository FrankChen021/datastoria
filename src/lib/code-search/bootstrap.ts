import "server-only";
import { startCodeSearchMaterialization } from "./config";

let started = false;

export function startCodeSearchWarmup() {
  if (started) {
    return;
  }

  started = true;
  startCodeSearchMaterialization();
}

export function resetCodeSearchWarmupForTests() {
  started = false;
}
