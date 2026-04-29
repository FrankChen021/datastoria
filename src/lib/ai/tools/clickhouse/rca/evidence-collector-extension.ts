import type { RcaContextExtension } from "./evidence-collector-common";

/**
 * OSS default: no optional RCA context extension is available.
 *
 * Alternative distributions can replace or alias this module to return a real
 * resolver without changing the OSS RCA wiring.
 *
 * Example replacement:
 *
 * ```ts
 * export function getRcaContextExtension(): RcaContextExtension | undefined {
 *   return {
 *     name: "extension-resolver",
 *     async resolve(input) {
 *       return {
 *         available: true,
 *         source: "extension",
 *         observations: [
 *           {
 *             source: "extension.resolver",
 *             description: `Extended RCA context for ${input.symptom}`,
 *             metrics: {
 *               nodes_considered: 0,
 *             },
 *           },
 *         ],
 *       };
 *     },
 *   };
 * }
 * ```
 */
export function getRcaContextExtension(): RcaContextExtension | undefined {
  return undefined;
}
