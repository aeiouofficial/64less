# Contributing

64less intentionally keeps a small core. A compatibility rule should only be added when its Windows and Linux semantics are understood and testable.

Before submitting a change:

```bash
npm run verify
```

For a new adapter rule, include:

1. a real input shape;
2. the expected native Linux output;
3. a test for the transformation;
4. a test or diagnostic for a nearby unsupported case.

Avoid broad regular expressions that "fix" arbitrary commands. If a rule cannot distinguish a path from data or a command from an argument, it probably belongs in the later structured command parser rather than the current conservative adapter.
