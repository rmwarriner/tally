import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { BookResponse } from "./api";
import { LedgerOperationsPanels } from "./LedgerOperationsPanels";
import { LedgerRegisterPanel } from "./LedgerRegisterPanel";
import type { AmountStyle } from "./app-format";
import type { LedgerInlineRowEditDraft } from "./ledger-state";
import type { createLedgerBookModel, createReconciliationBookModel } from "./shell";

interface LedgerMainPanelsProps {
  activeLedgerRegisterTabId: string;
  amountStyle: AmountStyle;
  bookVersion: number;
  busy: string | null;
  expenseAccounts: BookResponse["book"]["accounts"];
  formatCurrency: (amount: number) => string;
  formatTransactionStatus: (status: "cleared" | "open" | "reconciled") => string;
  inlineEditDraft: LedgerInlineRowEditDraft | null;
  inlineEditingTransactionId: string | null;
  isLedgerDetailOpen: boolean;
  isLedgerOperationsOpen: boolean;
  ledgerRange: { from: string; to: string };
  ledgerRegisterTabs: Array<{
    accountId: string | null;
    id: string;
    label: string;
  }>;
  ledgerSearchInputRef: RefObject<HTMLInputElement | null>;
  ledgerSearchText: string;
  ledgerStatusFilter: "all" | "cleared" | "open" | "reconciled";
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
  }) => void;
  onDeleteInlineTransaction: (transactionId: string) => void;
  onMoveLedgerRegisterTab: (direction: "left" | "right", tabId: string) => void;
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
  onToggleLedgerOperationsOpen: () => void;
  onUpdateInlineEditField: (field: keyof LedgerInlineRowEditDraft, value: string) => void;
  reconciliationForm: {
    accountId: string;
    statementBalance: string;
    statementDate: string;
  };
  reconciliationBook: ReturnType<typeof createReconciliationBookModel>;
  runMutation: (label: string, operation: () => Promise<void>) => Promise<void>;
  selectedLedgerAccountId: string | null;
  selectedLedgerTransactionId: string | null;
  setLedgerRange: Dispatch<SetStateAction<{ from: string; to: string }>>;
  setLedgerSearchText: Dispatch<SetStateAction<string>>;
  setLedgerStatusFilter: Dispatch<SetStateAction<"all" | "cleared" | "open" | "reconciled">>;
  setReconciliationForm: Dispatch<
    SetStateAction<{
      accountId: string;
      statementBalance: string;
      statementDate: string;
    }>
  >;
  setSelectedLedgerAccountId: Dispatch<SetStateAction<string | null>>;
  setSelectedLedgerTransactionId: Dispatch<SetStateAction<string | null>>;
  setSelectedReconciliationTransactionIds: Dispatch<SetStateAction<Record<string, boolean>>>;
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
        ledgerRange={props.ledgerRange}
        ledgerRegisterTabs={props.ledgerRegisterTabs}
        ledgerSearchInputRef={props.ledgerSearchInputRef}
        ledgerSearchText={props.ledgerSearchText}
        ledgerStatusFilter={props.ledgerStatusFilter}
        ledgerBook={props.ledgerBook}
        isFiltered={props.ledgerIsFiltered}
        liquidAccounts={props.liquidAccounts}
        openingBalance={props.ledgerOpeningBalance}
        onActivateLedgerRegisterTab={props.onActivateLedgerRegisterTab}
        onCancelInlineEdit={props.onCancelInlineEdit}
        onCloseLedgerRegisterTab={props.onCloseLedgerRegisterTab}
        onCreateInlineTransaction={props.onCreateInlineTransaction}
        onDeleteInlineTransaction={props.onDeleteInlineTransaction}
        onMoveLedgerRegisterTab={props.onMoveLedgerRegisterTab}
        onOpenAdvancedEditor={props.onOpenAdvancedEditor}
        onOpenLedgerRegisterTabForAccount={props.onOpenLedgerRegisterTabForAccount}
        onOpenLinkedRegisterTabs={props.onOpenLinkedRegisterTabs}
        onSaveInlineEdit={props.onSaveInlineEdit}
        onSaveInlineSplitEdit={props.onSaveInlineSplitEdit}
        onStartInlineEdit={props.onStartInlineEdit}
        onUpdateInlineEditField={props.onUpdateInlineEditField}
        selectedLedgerAccountId={props.selectedLedgerAccountId}
        selectedLedgerTransactionId={props.selectedLedgerTransactionId}
        setLedgerRange={props.setLedgerRange}
        setLedgerSearchText={props.setLedgerSearchText}
        setLedgerStatusFilter={props.setLedgerStatusFilter}
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
      ) : (
        <article className="panel">
          <div className="panel-header">
            <span>Advanced editor</span>
            <span className="muted">Optional</span>
          </div>
          <p className="form-hint">
            Inline row editing is the default. Use the row-level Advanced action only when you need
            split-level editing details.
          </p>
        </article>
      )}
      <article className="panel">
        <div className="panel-header">
          <span>Ledger operations</span>
          <span className="muted">Reconciliation and statement matching</span>
        </div>
        <div className="posting-editor-row">
          <button type="button" onClick={props.onToggleLedgerOperationsOpen}>
            {props.isLedgerOperationsOpen ? "Hide reconciliation panel" : "Open reconciliation panel"}
          </button>
        </div>
        {props.isLedgerOperationsOpen ? (
          <LedgerOperationsPanels
            bookVersion={props.bookVersion}
            busy={props.busy}
            liquidAccounts={props.liquidAccounts}
            reconciliationForm={props.reconciliationForm}
            reconciliationBook={props.reconciliationBook}
            runMutation={props.runMutation}
            setReconciliationForm={props.setReconciliationForm}
            setSelectedReconciliationTransactionIds={props.setSelectedReconciliationTransactionIds}
          />
        ) : (
          <p className="form-hint">
            Reconciliation is available on demand so routine editing stays register-first.
          </p>
        )}
      </article>
    </>
  );
}
