# Finance Boundary Review

Use this plugin when reviewing changes that touch:

- API handlers and request validation
- auth and actor handling
- workspace commands that mutate financial state
- audit-event generation and persistence
- operational logging around mutations, imports, and reconciliations

Primary review questions:

- are external inputs validated at the boundary?
- is client-supplied actor identity ignored or constrained?
- are audit events preserved for successful financial mutations?
- is structured logging present in operational code paths?
- do tests cover the risky branch behavior?
