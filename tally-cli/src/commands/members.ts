import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

type MemberRole = "admin" | "guardian" | "member";

interface Member {
  actor: string;
  role: MemberRole;
}

interface MembersEnvelope {
  members: Member[];
}

interface BookEnvelope {
  book: {
    householdMembers: string[];
    householdMemberRoles?: Partial<Record<string, MemberRole>>;
  };
}

function parseRole(value: string): MemberRole {
  if (value === "admin" || value === "guardian" || value === "member") {
    return value;
  }

  throw new Error("role must be admin, guardian, or member.");
}

function membersRows(members: Member[]): Array<Record<string, string>> {
  return members.map((member) => ({
    actor: member.actor,
    role: member.role,
  }));
}

function memberRowsFromBook(book: BookEnvelope["book"]): Member[] {
  const roles = book.householdMemberRoles ?? {};
  return book.householdMembers.map((actor) => ({
    actor,
    role: (roles[actor] ?? "member") as MemberRole,
  }));
}

async function runMembersList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const response = await context.api.requestJson<MembersEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/members`,
  );

  if (context.format === "json") {
    console.log(JSON.stringify(response.members, null, 2));
    return;
  }

  printRows(membersRows(response.members), ["actor", "role"], context.format);
}

async function runMembersAdd(command: Command, actor: string, roleArg?: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const role = typeof roleArg === "string" ? parseRole(roleArg) : undefined;

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/members`,
    {
      payload: {
        actor,
        role,
      },
    },
  );

  const updated = memberRowsFromBook(response.book).find((member) => member.actor === actor) ?? {
    actor,
    role: role ?? "member",
  };

  printRows(
    [{ action: "added", actor: updated.actor, role: updated.role }],
    ["action", "actor", "role"],
    context.format,
  );
}

async function runMembersRemove(command: Command, actor: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });

  await context.api.writeBookJson<BookEnvelope>(
    "DELETE",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/members/${encodeURIComponent(actor)}`,
  );

  printRows(
    [{ action: "removed", actor }],
    ["action", "actor"],
    context.format,
  );
}

async function runMembersRole(command: Command, actor: string, roleArg: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const role = parseRole(roleArg);

  await context.api.writeBookJson<BookEnvelope>(
    "PUT",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/members/${encodeURIComponent(actor)}/role`,
    {
      payload: {
        role,
      },
    },
  );

  printRows(
    [{ action: "role-updated", actor, role }],
    ["action", "actor", "role"],
    context.format,
  );
}

export function registerMembersCommands(program: Command): void {
  const members = program.command("members").description("Household member commands");

  members
    .command("list")
    .description("List household members")
    .action(async function membersListAction() {
      await runMembersList(this);
    });

  members
    .command("add")
    .description("Add household member")
    .argument("<actor>", "member actor")
    .argument("[role]", "admin|guardian|member")
    .action(async function membersAddAction(actor: string, role?: string) {
      await runMembersAdd(this, actor, role);
    });

  members
    .command("remove")
    .description("Remove household member")
    .argument("<actor>", "member actor")
    .action(async function membersRemoveAction(actor: string) {
      await runMembersRemove(this, actor);
    });

  members
    .command("role")
    .description("Set household member role")
    .argument("<actor>", "member actor")
    .argument("<role>", "admin|guardian|member")
    .action(async function membersRoleAction(actor: string, role: string) {
      await runMembersRole(this, actor, role);
    });
}
