import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

type TokenRole = "admin" | "member";

interface TokenRecord {
  actor: string;
  createdAt: string;
  createdBy: string;
  id: string;
  revokedAt?: string;
  role: TokenRole;
}

interface TokensEnvelope {
  tokens: TokenRecord[];
}

interface TokenEnvelope {
  token: TokenRecord;
}

interface IssueTokenEnvelope {
  token: TokenRecord;
  secret: string;
}

function parseTokenRole(value: string): TokenRole {
  if (value === "admin" || value === "member") {
    return value;
  }
  throw new Error("token role must be admin or member.");
}

function tokenRows(tokens: TokenRecord[]): Array<Record<string, string>> {
  return tokens.map((token) => ({
    actor: token.actor,
    createdAt: token.createdAt,
    createdBy: token.createdBy,
    id: token.id,
    revokedAt: token.revokedAt ?? "",
    role: token.role,
  }));
}

async function runTokensList(command: Command): Promise<void> {
  const context = buildContext(command);
  const response = await context.api.requestJson<TokensEnvelope>("GET", "/api/tokens");

  if (context.format === "json") {
    console.log(JSON.stringify(response.tokens, null, 2));
    return;
  }

  printRows(
    tokenRows(response.tokens),
    ["id", "actor", "role", "createdBy", "createdAt", "revokedAt"],
    context.format,
  );
}

async function runTokensNew(command: Command, actor: string, roleArg: string): Promise<void> {
  const context = buildContext(command);
  const role = parseTokenRole(roleArg);

  const response = await context.api.requestJson<IssueTokenEnvelope>("POST", "/api/tokens", {
    body: {
      payload: {
        actor,
        role,
      },
    },
  });

  if (context.format === "json") {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  printRows(
    [
      {
        actor: response.token.actor,
        createdAt: response.token.createdAt,
        createdBy: response.token.createdBy,
        id: response.token.id,
        role: response.token.role,
        secret: response.secret,
      },
    ],
    ["id", "actor", "role", "createdBy", "createdAt", "secret"],
    context.format,
  );
}

async function runTokensRevoke(command: Command, tokenId: string): Promise<void> {
  const context = buildContext(command);
  const response = await context.api.requestJson<TokenEnvelope>(
    "DELETE",
    `/api/tokens/${encodeURIComponent(tokenId)}`,
  );

  printRows(
    [
      {
        actor: response.token.actor,
        id: response.token.id,
        revokedAt: response.token.revokedAt ?? "",
        role: response.token.role,
      },
    ],
    ["id", "actor", "role", "revokedAt"],
    context.format,
  );
}

export function registerTokensCommands(program: Command): void {
  const tokens = program.command("tokens").description("Managed API token commands");

  tokens
    .command("list")
    .description("List managed API tokens")
    .action(async function tokensListAction() {
      await runTokensList(this);
    });

  tokens
    .command("new")
    .description("Issue a managed API token")
    .argument("<actor>", "token actor")
    .argument("<role>", "admin|member")
    .action(async function tokensNewAction(actor: string, role: string) {
      await runTokensNew(this, actor, role);
    });

  tokens
    .command("revoke")
    .description("Revoke a managed API token")
    .argument("<tokenId>", "token id")
    .action(async function tokensRevokeAction(tokenId: string) {
      await runTokensRevoke(this, tokenId);
    });
}
