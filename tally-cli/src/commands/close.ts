import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";
import { resolveDateRange } from "../lib/period";

interface BookClosePeriod {
  id: string;
  closedAt: string;
  closedBy: string;
  from: string;
  notes?: string;
  to: string;
}

interface BookEnvelope {
  book: {
    closePeriods?: BookClosePeriod[];
  };
}

async function runClose(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();

  if (opts.confirm !== true) {
    throw new Error("close requires --confirm.");
  }

  const range = resolveDateRange({
    begin: opts.begin,
    end: opts.end,
    period: opts.period,
  });

  if (!range) {
    throw new Error("close requires an explicit period via -p/--period or -b/--begin and -e/--end.");
  }

  const closedAt = new Date().toISOString();
  const notes = typeof opts.notes === "string" ? opts.notes : undefined;
  const closeId = typeof opts.id === "string" ? opts.id : undefined;

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/close-periods`,
    {
      payload: {
        closedAt,
        from: range.from,
        id: closeId,
        notes,
        to: range.to,
      },
    },
  );

  const latest =
    (response.book.closePeriods ?? []).find((period) => period.id === closeId) ??
    (response.book.closePeriods ?? []).at(-1);

  printRows(
    [
      {
        closedAt: latest?.closedAt ?? closedAt,
        closedBy: latest?.closedBy ?? "",
        closeId: latest?.id ?? closeId ?? "",
        from: latest?.from ?? range.from,
        notes: latest?.notes ?? notes ?? "",
        to: latest?.to ?? range.to,
      },
    ],
    ["closeId", "from", "to", "closedAt", "closedBy", "notes"],
    context.format,
  );
}

export function registerCloseCommand(program: Command): void {
  program
    .command("close")
    .description("Close a period")
    .option("-p, --period <expr>", "period shorthand")
    .option("-b, --begin <date>", "start date (inclusive)")
    .option("-e, --end <date>", "end date (inclusive)")
    .option("--confirm", "required safety flag for period close")
    .option("--notes <text>", "optional close notes")
    .option("--id <id>", "optional close period id")
    .action(async function closeAction() {
      await runClose(this);
    });
}
