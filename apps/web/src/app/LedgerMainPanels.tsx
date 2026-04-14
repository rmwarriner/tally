import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { BookResponse } from "./api";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import type { AmountStyle } from "./app-format";
import type { LedgerInlineRowEditDraft } from "./ledger-state";
import type { createLedgerBookModel } from "./shell";

interface LedgerMainPanelsProps {
  activeLedgerRegisterTabId: string;
  amountStyle: AmountStyle;
  busy: string | null;
  expenseAccounts: BookResponse["book"]["accounts"];
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  inlineEditDraft: LedgerInlineRowEditDraft | null;
  inlineEditingTransactionId: string | null;
  isLedgerDetailOpen: boolean;
  ledgerRegisterTabs: Array<{
    accountId: string | null;
    id: string;
    label: string;
  }>;
  ledgerBook: ReturnType<typeof createLedgerBookModel>;
  ledgerIsFiltered: boolean;
  liquidAccounts: BookResponse["book"]["accounts"];
  ledgerOpeningBalance: number;
  onActivateLedgerRegisterTab: (tabId: string) => void;
  onCancelInlineEdit: () => void;
  onCloseLedgerRegisterTab: (tabId: string) => void;
  onCreateInlineTransaction: (draft: {
    amount: string;
    date: string;
    description: string;
    expenseAccountId: string;
    payee: string;
    status: "cleared" | "open" | "reconciled";
  }) => void;
  onDeleteInlineTransaction: (transactionId: string) => void;
  onOpenNewTab: () => void;
  onOpenAdvancedEditor: () => void;
  onOpenLinkedRegisterTabs: (transactionId: string) => void;
  onOpenLedgerRegisterTabForAccount: (accountId: string) => void;
  onSaveInlineEdit: (transactionId: string) => void;
  onSaveInlineSplitEdit: (input: {
    splits: Array<{
      accountId: string;
      accountQuery: string;
      amount: string;
      cleared: boolean;
      commodityCode: string;
      memo: string;
    }>;
    transactionId: string;
  }) => void;
  onStartInlineEdit: (
    transaction: ReturnType<typeof createLedgerBookModel>["filteredTransactions"][number],
  ) => void;
  onToggleLedgerDetailOpen: () => void;
  onUpdateInlineEditField: (field: keyof LedgerInlineRowEditDraft, value: string) => void;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
  ledgerTotalCount: number;
  transactionEditorPanel: ReactNode;
}

export function LedgerMainPanels(props: LedgerMainPanelsProps) {
  return (
    <>
      <LedgerRegisterPanel
        activeLedgerRegisterTabId={props.activeLedgerRegisterTabId}
        amountStyle={props.amountStyle}
        busy={props.busy}
        expenseAccounts={props.expenseAccounts}
        formatCurrency={props.formatCurrency}
        formatTransactionStatus={props.formatTransactionStatus}
        inlineEditDraft={props.inlineEditDraft}
        inlineEditingTransactionId={props.inlineEditingTransactionId}
        ledgerRegisterTabs={props.ledgerRegisterTabs}
        ledgerBook={props.ledgerBook}
        isFiltered={props.ledgerIsFiltered}
        liquidAccounts={props.liquidAccounts}
        openingBalance={props.ledgerOpeningBalance}
        onActivateLedgerRegisterTab={props.onActivateLedgerRegisterTab}
        onCancelInlineEdit={props.onCancelInlineEdit}
        onCloseLedgerRegisterTab={props.onCloseLedgerRegisterTab}
        onCreateInlineTransaction={props.onCreateInlineTransaction}
        onDeleteInlineTransaction={props.onDeleteInlineTransaction}
        onOpenNewTab={props.onOpenNewTab}
        onOpenAdvancedEditor={props.onOpenAdvancedEditor}
        onOpenLedgerRegisterTabForAccount={props.onOpenLedgerRegisterTabForAccount}
        onOpenLinkedRegisterTabs={props.onOpenLinkedRegisterTabs}
        onSaveInlineEdit={props.onSaveInlineEdit}
        onSaveInlineSplitEdit={props.onSaveInlineSplitEdit}
        onStartInlineEdit={props.onStartInlineEdit}
        onUpdateInlineEditField={props.onUpdateInlineEditField}
        selectedLedgerAccountId={props.selectedLedgerAccountId}
        selectedLedgerTransactionId={props.selectedLedgerTransactionId}
        setSelectedLedgerAccountId={props.setSelectedLedgerAccountId}
        setSelectedLedgerTransactionId={props.setSelectedLedgerTransactionId}
        totalCount={props.ledgerTotalCount}
      />

      {props.isLedgerDetailOpen ? (
        <>
          <div className="posting-editor-row">
            <button type="button" onClick={props.onToggleLedgerDetailOpen}>
              Hide advanced editor
            </button>
          </div>
          {props.transactionEditorPanel}
        </>
      ) : null}
    </>
  );
}
