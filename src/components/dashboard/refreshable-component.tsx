
import type { TimeSpan } from "./timespan-selector";

export type RefreshParameter = {
  inputFilter?: string;
  selectedTimeSpan?: TimeSpan;
};

export interface RefreshableComponent {
  refresh(param: RefreshParameter): void;

  getLastRefreshParameter(): RefreshParameter;
}
