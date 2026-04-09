import { confirm } from "@inquirer/prompts";
import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

interface Backup {
  id: string;
  createdAt: string;
  fileName: string;
  sizeBytes: number;
  bookId: string;
}

interface BackupEnvelope {
  backup: Backup;
}

interface BackupsEnvelope {
  backups: Backup[];
}

interface BookEnvelope {
  book: {
    id: string;
    name: string;
    version: number;
  };
}

async function runBackupCreate(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const response = await context.api.writeBookJson<BackupEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/backups`,
  );

  printRows(
    [
      {
        backupId: response.backup.id,
        createdAt: response.backup.createdAt,
        fileName: response.backup.fileName,
        sizeBytes: response.backup.sizeBytes,
      },
    ],
    ["backupId", "createdAt", "fileName", "sizeBytes"],
    context.format,
  );
}

async function runBackupList(command: Command): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const response = await context.api.requestJson<BackupsEnvelope>(
    "GET",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/backups`,
  );

  printRows(
    response.backups.map((backup) => ({
      backupId: backup.id,
      bookId: backup.bookId,
      createdAt: backup.createdAt,
      fileName: backup.fileName,
      sizeBytes: backup.sizeBytes,
    })),
    ["backupId", "bookId", "createdAt", "fileName", "sizeBytes"],
    context.format,
  );
}

async function runBackupRestore(command: Command, backupId: string): Promise<void> {
  const context = buildContext(command, { requireBook: true });
  const opts = command.opts();
  const isTty = process.stdin.isTTY === true;

  if (isTty && opts.confirm !== true) {
    const approved = await confirm({
      default: false,
      message: `Restore backup ${backupId}?`,
    });

    if (!approved) {
      console.log("Cancelled.");
      return;
    }
  }

  if (!isTty && opts.confirm !== true) {
    throw new Error("backup restore requires --confirm in non-interactive mode.");
  }

  const response = await context.api.writeBookJson<BookEnvelope>(
    "POST",
    context.bookId ?? "",
    `/api/books/${encodeURIComponent(context.bookId ?? "")}/backups/${encodeURIComponent(backupId)}/restore`,
  );

  printRows(
    [
      {
        bookId: response.book.id,
        name: response.book.name,
        restoredFrom: backupId,
        version: response.book.version,
      },
    ],
    ["bookId", "name", "restoredFrom", "version"],
    context.format,
  );
}

export function registerBackupCommands(program: Command): void {
  const backup = program.command("backup").description("Backup commands");

  backup
    .command("create")
    .description("Create a backup")
    .action(async function backupCreateAction() {
      await runBackupCreate(this);
    });

  backup
    .command("list")
    .description("List backups")
    .action(async function backupListAction() {
      await runBackupList(this);
    });

  backup
    .command("restore")
    .description("Restore a backup")
    .argument("<id>", "backup id")
    .option("--confirm", "confirm restore (required in non-interactive mode)")
    .action(async function backupRestoreAction(id: string) {
      await runBackupRestore(this, id);
    });
}
