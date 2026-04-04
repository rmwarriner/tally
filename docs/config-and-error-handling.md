# Configuration And Error Handling

## Scope

This repository now treats runtime configuration and operational failures as typed boundaries rather than ad hoc strings and generic exceptions.

## Configuration Standard

- runtime environment values must be parsed into typed config before server startup
- numeric operational limits must be validated as positive integers
- malformed auth identity configuration must fail fast during bootstrap
- non-loopback binding must be rejected unless explicit auth configuration exists

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
