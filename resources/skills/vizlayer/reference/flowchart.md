# Flowchart Reference

Use this reference when the requested structure is directional: pipelines, branching, stages, or movement between nodes.

## Schema

```vizlayer
{
  "kind": "flowchart",
  "document": {
    "direction": "LR",
    "nodes": [
      { "id": "user", "label": "User" },
      { "id": "engine", "label": "Vizlayer" }
    ],
    "edges": [{ "from": "user", "to": "engine", "label": "describe diagram" }]
  }
}
```

## Requirements

- `nodes` must be non-empty.
- Every node needs `id` and `label`.
- Every edge needs `from` and `to`.
- `direction` should be one of `TB`, `TD`, `LR`, `RL`, `BT`.

## Authoring Guidance

- Use short, stable IDs like `user`, `engine`, `artifact`.
- Put human-readable text in `label`, not `id`.
- Use `edges[].label` only when the transition meaning matters.
- Prefer `LR` for left-to-right process diagrams and `TD` or `TB` for top-down flows.
- In final answers, prefer the unified `vizlayer` code fence with `kind: "flowchart"`.

## Example

Prompt:

`Show a product manager sending a spec to an AI engine, then the engine returns a rendered diagram.`

Output:

```vizlayer
{
  "kind": "flowchart",
  "document": {
    "direction": "LR",
    "nodes": [
      { "id": "pm", "label": "Product Manager" },
      { "id": "engine", "label": "AI Engine" },
      { "id": "diagram", "label": "Rendered Diagram" }
    ],
    "edges": [
      { "from": "pm", "to": "engine", "label": "send spec" },
      { "from": "engine", "to": "diagram", "label": "return output" }
    ]
  }
}
```

## Common Mistakes

- Leaving `nodes` empty
- Referencing `from` or `to` IDs that are not declared in `nodes`
- Putting paragraphs into `label` instead of concise titles
- Wrapping the payload in `json` instead of `vizlayer`
- Omitting the top-level `kind` or `document` fields in the unified payload
