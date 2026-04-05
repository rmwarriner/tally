# Configuration And Error Handling

## Scope

This repository now treats runtime configuration and operational failures as typed boundaries rather than ad hoc strings and generic exceptions.

## Configuration Standard

- runtime environment values must be parsed into typed config before server startup
- numeric operational limits must be validated as positive integers
- boolean runtime toggles must be validated explicitly
- runtime mode must be explicit and validated against supported values
- persistence backend selection must be explicit and validated against supported backend identifiers
- backend-specific path settings must be resolved and validated during startup
- backend-specific connection settings must be validated when a networked backend is selected
- auth secrets may be provided inline or by file path, but only one source may be configured at a time
- malformed auth identity configuration must fail fast during bootstrap
- non-loopback binding must be rejected unless explicit auth configuration exists
- production runtime must require explicit auth configuration
- production runtime must reject demo workspace seeding
- startup logging must confirm selected operational settings without emitting secret values

See `docs/api-runtime-operations.md` for the current API runtime variables and startup modes.

## Error Handling Standard

- repository, service, and HTTP layers must use typed operational errors
- API error responses must include:
  - `error.code`
  - `error.message`
  - `error.status`
  - optional `error.details`
- the legacy `errors` array remains for compatibility, but `error` is the primary contract
- unexpected internal failures must be masked from clients and logged with structured context
- expected validation and authorization failures should be exposed with stable codes

## Current Codes

- `auth.required`
- `auth.forbidden`
- `config.invalid`
- `repository.invalid_identifier`
- `repository.unavailable`
- `request.invalid`
- `request.not_found`
- `request.too_large`
- `request.unsupported_media_type`
- `security.rate_limited`
- `validation.failed`
- `workspace.not_found`
- `internal.unexpected`

## Client Guidance

- UI clients should branch on `error.code`, not free-form message text
- UI clients should present `error.message` to users only when the error is expected and exposed
- retries should be based on status and code, for example `security.rate_limited`
