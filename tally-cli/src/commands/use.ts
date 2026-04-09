import type { Command } from "commander";
import { getGlobalOptions } from "../lib/context";
import { writeConfig } from "../lib/config";

export function registerUseCommand(program: Command): void {
  program
    .command("use")
    .description("Set the current book ID")
    .argument("<bookId>", "book identifier")
    .action(function useAction(bookId: string) {
      const globalOptions = getGlobalOptions(this);
      writeConfig({
        apiUrl: globalOptions.api,
        currentBook: bookId,
        token: globalOptions.token,
      });
      console.log(`Current book set to ${bookId}`);
    });
}
