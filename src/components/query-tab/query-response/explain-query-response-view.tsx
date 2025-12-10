import { memo } from "react";
import type { QueryResponseViewProps } from "../query-view-model";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ExplainQueryResponseViewComponent = ({ queryRequest: _queryRequest, queryResponse }: QueryResponseViewProps) => {
  const text =
    typeof queryResponse.data === "string" ? queryResponse.data : JSON.stringify(queryResponse.data, null, 4);

  return (
    <div className="my-2 overflow-x-scroll w-full h-full whitespace-nowrap">
      <pre className="overflow-x-auto text-xs">{text}</pre>
    </div>
  );
};

export const ExplainQueryResponseView = memo(ExplainQueryResponseViewComponent);

