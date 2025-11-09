interface QueryResponseHeaderViewProps {
  headers: Record<string, string>;
}

export function QueryResponseHeaderView({ headers }: QueryResponseHeaderViewProps) {
  if (!headers) {
    return null;
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b">
          <th className="text-left p-2 whitespace-nowrap">Name</th>
          <th className="text-left p-2 whitespace-nowrap">Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(headers).map(([key, value], index) => (
          <tr key={index} className="border-b">
            <td className="p-2 whitespace-nowrap">{key}</td>
            <td className="p-2">{String(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

