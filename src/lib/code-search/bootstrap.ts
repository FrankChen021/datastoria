import "server-only";
import { defaultCodeSearchFactory } from "./code-search-factory";

let started = false;

export function startCodeSearchWarmup() {
  if (started) {
    return;
  }

  started = true;
  void defaultCodeSearchFactory.getCodeSearchContext();
}

export function resetCodeSearchWarmupForTests() {
  started = false;
}
