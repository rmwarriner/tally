import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { buildContext } from "../lib/context";
import { printRows } from "../lib/output";

interface BooksEnvelope {
  books: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

interface BookEnvelope {
  book: {
    id: string;
    name: string;
  };
}

function toBookId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  if (base.length > 0) {
    return base;
  }

  return `book-${randomUUID().slice(0, 8)}`;
}

export function registerBooksCommands(program: Command): void {
  const books = program.command("books").description("Book context commands");

  books
    .command("list")
    .description("List accessible books")
    .action(async function booksListAction() {
      const context = buildContext(this);
      const body = await context.api.requestJson<BooksEnvelope>("GET", "/api/books");
      printRows(body.books, ["id", "name", "role"], context.format);
    });

  books
    .command("new")
    .description("Create a new book")
    .argument("<name>", "book name")
    .action(async function booksNewAction(name: string) {
      const context = buildContext(this);
      const bookId = toBookId(name);
      const created = await context.api.requestJson<BookEnvelope>("POST", "/api/books", {
        body: {
          payload: {
            bookId,
            name,
          },
        },
      });

      printRows(
        [
          {
            id: created.book.id,
            name: created.book.name,
          },
        ],
        ["id", "name"],
        context.format,
      );
    });
}
