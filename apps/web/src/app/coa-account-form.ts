import type { AccountType } from "@tally/domain";

export interface CoaAccountDraft {
  code: string;
  name: string;
  parentAccountId?: string;
  type: AccountType;
}

interface CreateCoaAccountDraftInput {
  parentAccountId: string | null;
  parentAccountType?: AccountType;
}

export function createCoaAccountDraft(input: CreateCoaAccountDraftInput): CoaAccountDraft {
  return {
    code: "",
    name: "",
    parentAccountId: input.parentAccountId ?? undefined,
    type: input.parentAccountType ?? "asset",
  };
}

export function canSaveCoaAccountDraft(draft: CoaAccountDraft): boolean {
  return draft.code.trim().length > 0 && draft.name.trim().length > 0;
}
