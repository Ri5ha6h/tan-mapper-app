# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Array Fix, Node-Level Mapping Clear, Test Suite

## Context

Three changes are needed:
1. **Array representation bug** — The modal's Input pane (and by extension Output) shows double-nested arrays and loses primitive types. E.g., `products` becomes `[[{...}]]` instead of `[{...}]`, and numbers become strings.
2. **Clear mapping on tree node level** — Currently mappings can only be removed from the mappings panel or by clicking connection lines. Users ne...

